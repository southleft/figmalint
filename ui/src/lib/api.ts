/**
 * Backend API client for the Design Review Chat backend.
 * All calls go through the plugin UI iframe (has fetch access).
 */

const DEFAULT_BACKEND_URL = 'https://api.figmalint.labpics.com';

let backendUrl = DEFAULT_BACKEND_URL;

export function setBackendUrl(url: string): void {
  backendUrl = url.replace(/\/$/, '');
}

export function getBackendUrl(): string {
  return backendUrl;
}

/**
 * POST /api/analyze — full AI analysis with screenshot + lint.
 */
export async function analyzeComponent(data: {
  screenshot: string;
  lintResult: unknown;
  extractedData: {
    componentName: string;
    componentDescription?: string;
    properties?: Array<{ name: string; type: string }>;
    states?: string[];
    metadata?: {
      nodeId: string;
      nodeType: string;
      width: number;
      height: number;
      hasAutoLayout: boolean;
      childCount: number;
    };
  };
  sessionId?: string;
  mode: 'quick' | 'deep';
}): Promise<{
  sessionId: string;
  pageType: string;
  aiReview: {
    visualHierarchy: { score: number; notes: string };
    spacingRhythm: { score: number; notes: string };
    colorHarmony: { score: number; notes: string };
    missingStates: string[];
    recommendations: Array<{ title: string; description: string; severity: string }>;
    overallScore: number;
    summary: string;
  };
  combinedScore: number;
}> {
  const resp = await fetch(`${backendUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || 'Analysis failed');
  }

  return resp.json();
}

/**
 * POST /api/chat — non-streaming chat.
 */
export async function chatMessage(sessionId: string, message: string): Promise<{ message: string }> {
  const resp = await fetch(`${backendUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || 'Chat failed');
  }

  return resp.json();
}

/**
 * POST /api/stream/:sessionId — SSE streaming chat.
 * Returns an EventSource-like reader.
 */
export async function streamChat(
  sessionId: string,
  message: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const resp = await fetch(`${backendUrl}/api/stream/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      onError(err.error || 'Stream failed');
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      onError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          try {
            const parsed = JSON.parse(data);
            if (currentEvent === 'error') {
              onError(parsed.error || 'Stream error');
              return;
            }
            if (currentEvent === 'done') {
              onDone();
              return;
            }
            if (parsed.text) onChunk(parsed.text);
          } catch {
            // Not JSON, skip
          }
          currentEvent = '';
        }
      }
    }

    onDone();
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Stream failed');
  }
}

/**
 * GET /api/health — check backend availability.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${backendUrl}/api/health`, { method: 'GET' });
    return resp.ok;
  } catch {
    return false;
  }
}
