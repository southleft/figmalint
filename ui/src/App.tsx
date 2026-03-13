import { useState, useCallback, useEffect, useRef } from 'react';
import ChatContainer from './components/chat/ChatContainer';
import { useChat } from './hooks/useChat';
import { usePluginMessages, usePostToPlugin } from './hooks/usePluginMessages';
import type { PluginEvent, LintResult, LintError } from './lib/messages';
import { analyzeComponent, streamChat, checkHealth, setBackendUrl } from './lib/api';

export default function App() {
  const chat = useChat();
  const post = usePostToPlugin();
  const [componentName, setComponentName] = useState<string | undefined>();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const walkthroughIndex = useRef(0);
  const pendingLintResult = useRef<LintResult | null>(null);
  const pendingScreenshot = useRef<{ screenshot: string; nodeId: string; nodeName: string; width: number; height: number } | null>(null);

  // Try to send lint + screenshot to backend for AI analysis
  const tryBackendAnalysis = useCallback(async (
    lintResult: LintResult,
    screenshot: { screenshot: string; nodeId: string; nodeName: string; width: number; height: number }
  ) => {
    if (!backendAvailable) return;

    chat.addMessage({
      kind: 'ai-text',
      content: 'Running AI visual analysis...',
    });

    try {
      const result = await analyzeComponent({
        screenshot: screenshot.screenshot,
        lintResult,
        extractedData: {
          componentName: componentName || screenshot.nodeName || 'Component',
          metadata: {
            nodeId: screenshot.nodeId,
            nodeType: 'FRAME',
            width: screenshot.width,
            height: screenshot.height,
            hasAutoLayout: false,
            childCount: 0,
          },
        },
        sessionId: chat.sessionId || undefined,
        mode: 'quick',
      });

      chat.handleAiReview({
        sessionId: result.sessionId,
        aiReview: result.aiReview,
        combinedScore: result.combinedScore,
      });
    } catch (error) {
      chat.addMessage({
        kind: 'ai-text',
        content: `AI analysis unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, [backendAvailable, chat, componentName]);

  // Listen for messages from the plugin main thread
  usePluginMessages(
    useCallback(
      (event: PluginEvent) => {
        switch (event.type) {
          case 'design-lint-result':
            // If we already have a lint result, treat this as a rescan
            if (chat.lintResult) {
              chat.handleRescan(event.data as LintResult);
            } else {
              chat.handleLintResult(event.data as LintResult);
              // Store lint result and request screenshot for AI analysis
              pendingLintResult.current = event.data as LintResult;
              post('export-screenshot');
            }
            break;
          case 'enhanced-analysis-result': {
            const result = event.data as any;
            if (result.metadata?.component) {
              setComponentName(result.metadata.component);
            }
            if (result.lintResult) {
              chat.handleLintResult(result.lintResult);
            }
            break;
          }
          case 'analysis-error':
            chat.addMessage({
              kind: 'ai-text',
              content: `Error: ${(event.data as any)?.error || 'Unknown error'}`,
            });
            break;
          case 'fix-applied':
            chat.handleFixApplied(event.data as any);
            break;
          case 'fix-error':
            chat.addMessage({
              kind: 'ai-text',
              content: `Fix failed: ${(event.data as any)?.error || 'Unknown error'}`,
            });
            break;
          case 'batch-fix-v2-result':
            chat.handleBatchFixResult(event.data as any);
            break;
          case 'rescan-complete':
            // Rescan lint result will arrive via 'design-lint-result' — handled there
            break;
          case 'screenshot-result': {
            const ssData = event.data as { nodeId: string; nodeName: string; screenshot: string; width: number; height: number };
            pendingScreenshot.current = ssData;
            // If we have both lint result and screenshot, trigger backend analysis
            if (pendingLintResult.current && pendingScreenshot.current) {
              tryBackendAnalysis(pendingLintResult.current, pendingScreenshot.current);
              pendingLintResult.current = null;
              pendingScreenshot.current = null;
            }
            break;
          }
          case 'screenshot-error':
            // Screenshot failed — clear pending lint so we don't hang
            pendingLintResult.current = null;
            break;
          case 'api-key-status':
            setHasApiKey((event.data as any)?.hasKey || false);
            break;
        }
      },
      [chat, post, tryBackendAnalysis]
    )
  );

  // Check API key and backend health on mount
  useEffect(() => {
    post('check-api-key');
    checkHealth().then(ok => setBackendAvailable(ok));
  }, [post]);

  const handleAnalyze = useCallback(() => {
    chat.startAnalysis();
    walkthroughIndex.current = 0;
    post('run-design-lint');
  }, [chat, post]);

  const handleSendMessage = useCallback(
    (text: string) => {
      chat.addMessage({ kind: 'user-text', content: text });

      // If we have a backend session, use streaming chat
      if (chat.sessionId && backendAvailable) {
        streamChat(
          chat.sessionId,
          text,
          (chunk) => chat.appendStreamChunk(chunk),
          () => chat.finishStream(),
          (error) => {
            chat.finishStream();
            chat.addMessage({ kind: 'ai-text', content: `Error: ${error}` });
          }
        );
      } else {
        // Fallback to plugin main thread chat
        post('chat-message', { message: text });
      }
    },
    [chat, post, backendAvailable]
  );

  const handleAction = useCallback(
    (action: string, params?: Record<string, unknown>) => {
      switch (action) {
        case 'fix-all': {
          // Collect all spacing errors and send as batch fix
          const spacingErrors = chat.lintResult?.errors.filter(
            (e: LintError) => e.errorType === 'spacing'
          );
          if (spacingErrors && spacingErrors.length > 0) {
            chat.addMessage({
              kind: 'ai-text',
              content: `Fixing ${spacingErrors.length} spacing issue${spacingErrors.length !== 1 ? 's' : ''}...`,
            });

            // Build batch fix actions
            const fixes = spacingErrors.map(err => ({
              type: 'fixSpacingToNearest' as const,
              params: {
                nodeId: err.nodeId,
                property: err.property || extractSpacingProperty(err.message),
              },
            }));

            post('batch-fix-v2', { fixes });
          }
          break;
        }

        case 'walkthrough': {
          const errors = chat.lintResult?.errors;
          if (!errors || errors.length === 0) break;

          const idx = walkthroughIndex.current;
          if (idx >= errors.length) {
            chat.addMessage({
              kind: 'ai-text',
              content: 'All issues reviewed!',
            });
            walkthroughIndex.current = 0;
            break;
          }

          const issue = errors[idx];
          walkthroughIndex.current = idx + 1;

          chat.addMessage({
            kind: 'ai-text',
            content: `**${idx + 1}/${errors.length}:** ${issue.message}\n\nLayer: **${issue.nodeName}** (${issue.nodeType})`,
          });

          // Show fix actions for this issue
          const buttons = [];
          if (issue.errorType === 'spacing') {
            buttons.push({
              id: `fix-${issue.nodeId}`,
              label: 'Fix to nearest',
              variant: 'primary' as const,
              action: 'fix-single-spacing',
              params: { nodeId: issue.nodeId, property: issue.property || extractSpacingProperty(issue.message) },
            });
          }
          buttons.push({
            id: `skip-${idx}`,
            label: idx + 1 < errors.length ? 'Next issue' : 'Done',
            variant: 'secondary' as const,
            action: 'walkthrough',
          });

          chat.addMessage({ kind: 'action-buttons', buttons });
          post('jump-to-node', { nodeId: issue.nodeId });
          break;
        }

        case 'fix-single-spacing': {
          if (params?.nodeId && params?.property) {
            post('fix-spacing-to-nearest', {
              nodeId: params.nodeId,
              property: params.property,
            });
          }
          break;
        }

        case 'rescan': {
          chat.addMessage({ kind: 'ai-text', content: 'Re-scanning...' });
          post('rescan-lint');
          break;
        }

        case 'export': {
          const result = chat.lintResult;
          if (result) {
            const md = buildMarkdownExport(result, componentName, chat.issuesFixed);
            navigator.clipboard.writeText(md).then(
              () => {
                chat.addMessage({
                  kind: 'ai-text',
                  content: 'Lint report copied to clipboard!',
                });
              },
              () => {
                chat.addMessage({
                  kind: 'ai-text',
                  content: 'Failed to copy report to clipboard.',
                });
              }
            );
          }
          break;
        }
      }
    },
    [chat, post, componentName]
  );

  const handleJumpToNode = useCallback(
    (nodeId: string) => {
      post('jump-to-node', { nodeId });
    },
    [post]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Top analyze bar (shown when no results yet) */}
      {chat.messages.length === 0 && !chat.isAnalyzing && (
        <div className="px-3 py-2 border-b border-border">
          <button
            className="w-full py-2 bg-bg-brand text-fg-onbrand text-12 font-medium rounded-md hover:opacity-90 transition-opacity"
            onClick={handleAnalyze}
          >
            Analyze Selection
          </button>
        </div>
      )}

      <ChatContainer
        state={chat}
        componentName={componentName}
        onAnalyze={handleAnalyze}
        onSendMessage={handleSendMessage}
        onAction={handleAction}
        onJumpToNode={handleJumpToNode}
      />
    </div>
  );
}

/**
 * Extract spacing property name from lint error message.
 * Messages look like: "Gap is 13px — not in spacing scale"
 */
function extractSpacingProperty(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('gap') && !lower.includes('counter')) return 'itemSpacing';
  if (lower.includes('counter')) return 'counterAxisSpacing';
  if (lower.includes('padding top')) return 'paddingTop';
  if (lower.includes('padding bottom')) return 'paddingBottom';
  if (lower.includes('padding left')) return 'paddingLeft';
  if (lower.includes('padding right')) return 'paddingRight';
  return 'itemSpacing'; // fallback
}

function buildMarkdownExport(result: LintResult, componentName?: string, issuesFixed?: number): string {
  const lines = [
    `# Design Lint Report: ${componentName || 'Component'}`,
    '',
    `Total issues: ${result.summary.totalErrors} across ${result.summary.nodesWithErrors} layers`,
    ...(issuesFixed ? [`Fixed: ${issuesFixed}`] : []),
    '',
    '## Issues by Type',
    '',
  ];

  const byType = result.summary.byType;
  if (byType.fill > 0) lines.push(`- **Fill styles:** ${byType.fill} missing`);
  if (byType.stroke > 0) lines.push(`- **Stroke styles:** ${byType.stroke} missing`);
  if (byType.effect > 0) lines.push(`- **Effect styles:** ${byType.effect} missing`);
  if (byType.text > 0) lines.push(`- **Text styles:** ${byType.text} missing`);
  if (byType.radius > 0) lines.push(`- **Border radius:** ${byType.radius} non-standard`);
  if (byType.spacing > 0) lines.push(`- **Spacing:** ${byType.spacing} off-grid`);
  if (byType.autoLayout > 0) lines.push(`- **Auto Layout:** ${byType.autoLayout} missing`);

  lines.push('', '## All Issues', '');
  for (const err of result.errors) {
    lines.push(`- **[${err.errorType.toUpperCase()}]** ${err.nodeName}: ${err.message}`);
  }

  return lines.join('\n');
}
