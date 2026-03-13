import { useState, useCallback, useEffect, useRef } from 'react';
import ChatContainer from './components/chat/ChatContainer';
import SettingsPanel from './components/shared/SettingsPanel';
import { useChat } from './hooks/useChat';
import { usePluginMessages, usePostToPlugin } from './hooks/usePluginMessages';
import type { PluginEvent, LintResult, LintError, AiReviewData, ReferoComparisonData } from './lib/messages';
import { analyzeComponent, streamChat, checkHealth, setBackendUrl, fetchReferoData } from './lib/api';

export default function App() {
  const chat = useChat();
  const post = usePostToPlugin();
  const [componentName, setComponentName] = useState<string | undefined>();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<'quick' | 'deep'>('quick');
  const [showSettings, setShowSettings] = useState(false);
  const walkthroughIndex = useRef(0);
  const referoPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
        mode: analysisMode,
      });

      chat.handleAiReview({
        sessionId: result.sessionId,
        aiReview: result.aiReview as AiReviewData,
        referoComparison: result.referoComparison,
      });

      // In quick mode, Refero runs in background — poll for results
      if (analysisMode === 'quick' && !result.referoComparison) {
        startReferoPolling(result.sessionId);
      }
    } catch (error) {
      chat.addMessage({
        kind: 'ai-text',
        content: `AI analysis unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, [backendAvailable, chat, componentName, analysisMode]);

  // Poll for async Refero data (quick mode background fetch)
  const startReferoPolling = useCallback((sessionId: string) => {
    // Clear any existing poll
    if (referoPollingRef.current) clearInterval(referoPollingRef.current);

    let attempts = 0;
    referoPollingRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 12) { // max ~1 minute of polling
        if (referoPollingRef.current) clearInterval(referoPollingRef.current);
        referoPollingRef.current = null;
        return;
      }
      try {
        const result = await fetchReferoData(sessionId);
        if (result.ready && result.data) {
          if (referoPollingRef.current) clearInterval(referoPollingRef.current);
          referoPollingRef.current = null;
          chat.addMessage({ kind: 'refero-gallery', data: result.data });
          if (result.data.suggestions?.length > 0) {
            const sugText = result.data.suggestions
              .map((s: { title: string; description: string; evidence: string }) => `- **${s.title}:** ${s.description} _(${s.evidence})_`)
              .join('\n');
            chat.addMessage({ kind: 'ai-text', content: `**Refero-based suggestions:**\n${sugText}` });
          }
        }
      } catch { /* polling failed, will retry */ }
    }, 5000);
  }, [chat]);

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
          case 'api-key-saved':
            if ((event.data as any)?.success) {
              setHasApiKey(true);
              chat.addMessage({ kind: 'ai-text', content: 'API key saved successfully.' });
            }
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
            const fixes = spacingErrors
              .filter(err => err.property)
              .map(err => ({
                type: 'fixSpacingToNearest' as const,
                params: {
                  nodeId: err.nodeId,
                  property: err.property!,
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
          if (issue.errorType === 'spacing' && issue.property) {
            buttons.push({
              id: `fix-${issue.nodeId}`,
              label: 'Fix to nearest',
              variant: 'primary' as const,
              action: 'fix-single-spacing',
              params: { nodeId: issue.nodeId, property: issue.property },
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
            const md = buildFullReport(result, componentName, chat.issuesFixed, chat.aiReview);
            navigator.clipboard.writeText(md).then(
              () => {
                chat.addMessage({
                  kind: 'ai-text',
                  content: 'Full report copied to clipboard!',
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

        case 'export-json': {
          const jsonResult = chat.lintResult;
          if (jsonResult) {
            const report = {
              component: componentName || 'Component',
              timestamp: new Date().toISOString(),
              lint: {
                summary: jsonResult.summary,
                errors: jsonResult.errors,
                issuesFixed: chat.issuesFixed,
              },
              aiReview: chat.aiReview || undefined,
            };
            navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(
              () => chat.addMessage({ kind: 'ai-text', content: 'JSON report copied to clipboard!' }),
              () => chat.addMessage({ kind: 'ai-text', content: 'Failed to copy JSON to clipboard.' }),
            );
          }
          break;
        }

        case 'toggle-mode': {
          const next = analysisMode === 'quick' ? 'deep' : 'quick';
          setAnalysisMode(next);
          chat.addMessage({
            kind: 'ai-text',
            content: `Analysis mode: **${next}**. ${next === 'deep' ? 'Refero comparison will be included in the initial response.' : 'Refero data loads in the background.'}`,
          });
          break;
        }
      }
    },
    [chat, post, componentName, analysisMode]
  );

  const handleJumpToNode = useCallback(
    (nodeId: string) => {
      post('jump-to-node', { nodeId });
    },
    [post]
  );

  return (
    <div className="h-full flex flex-col relative">
      {/* Settings panel (overlay) */}
      {showSettings && (
        <SettingsPanel
          hasApiKey={hasApiKey}
          analysisMode={analysisMode}
          backendAvailable={backendAvailable}
          onSaveApiKey={(key, prov) => post('save-api-key', { apiKey: key, provider: prov })}
          onClearApiKey={() => { post('clear-api-key'); setHasApiKey(false); }}
          onToggleMode={() => {
            const next = analysisMode === 'quick' ? 'deep' : 'quick';
            setAnalysisMode(next);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Top analyze bar (shown when no results yet) */}
      {chat.messages.length === 0 && !chat.isAnalyzing && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <button
            className="flex-1 py-2 bg-bg-brand text-fg-onbrand text-12 font-medium rounded-md hover:opacity-90 transition-opacity"
            onClick={handleAnalyze}
          >
            Analyze Selection
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="shrink-0 w-8 h-8 flex items-center justify-center text-fg-tertiary hover:text-fg rounded-md hover:bg-bg-hover transition-colors"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      )}

      <ChatContainer
        state={chat}
        componentName={componentName}
        analysisMode={analysisMode}
        onAnalyze={handleAnalyze}
        onSendMessage={handleSendMessage}
        onAction={handleAction}
        onJumpToNode={handleJumpToNode}
        onOpenSettings={() => setShowSettings(true)}
      />
    </div>
  );
}


function buildFullReport(
  result: LintResult,
  componentName?: string,
  issuesFixed?: number,
  aiReview?: AiReviewData | null,
): string {
  const lines = [
    `# Design Review Report: ${componentName || 'Component'}`,
    '',
    `Total lint issues: ${result.summary.totalErrors} across ${result.summary.nodesWithErrors} layers`,
    ...(issuesFixed ? [`Fixed: ${issuesFixed}`] : []),
    '',
  ];

  // Lint breakdown
  lines.push('## Lint Issues', '');
  const byType = result.summary.byType;
  if (byType.fill > 0) lines.push(`- **Fill styles:** ${byType.fill} missing`);
  if (byType.stroke > 0) lines.push(`- **Stroke styles:** ${byType.stroke} missing`);
  if (byType.effect > 0) lines.push(`- **Effect styles:** ${byType.effect} missing`);
  if (byType.text > 0) lines.push(`- **Text styles:** ${byType.text} missing`);
  if (byType.radius > 0) lines.push(`- **Border radius:** ${byType.radius} non-standard`);
  if (byType.spacing > 0) lines.push(`- **Spacing:** ${byType.spacing} off-grid`);
  if (byType.autoLayout > 0) lines.push(`- **Auto Layout:** ${byType.autoLayout} missing`);

  // AI Review section (rubric-based)
  if (aiReview) {
    lines.push('', '## AI Design Review', '');
    lines.push(`| Category | Rating |`);
    lines.push(`|----------|--------|`);
    lines.push(`| Visual Hierarchy | ${aiReview.visualHierarchy.rating.toUpperCase()} |`);
    lines.push(`| States Coverage | ${aiReview.statesCoverage.rating.toUpperCase()} |`);
    lines.push(`| Platform Alignment | ${aiReview.platformAlignment.rating.toUpperCase()} (${aiReview.platformAlignment.detectedPlatform}) |`);
    lines.push(`| Color Harmony | ${aiReview.colorHarmony.rating.toUpperCase()} |`);

    const missingStates = aiReview.statesCoverage?.missingStates || [];
    if (missingStates.length > 0) {
      lines.push('', `**Missing states:** ${missingStates.join(', ')}`);
    }

    if (aiReview.recommendations.length > 0) {
      lines.push('', '### Recommendations', '');
      for (const rec of aiReview.recommendations) {
        lines.push(`- **[${rec.severity.toUpperCase()}]** ${rec.title}: ${rec.description}`);
      }
    }

    if (aiReview.summary) {
      lines.push('', `> ${aiReview.summary}`);
    }
  }

  // All issues detail
  if (result.errors.length > 0) {
    lines.push('', '## All Issues', '');
    for (const err of result.errors) {
      lines.push(`- **[${err.errorType.toUpperCase()}]** ${err.nodeName}: ${err.message}`);
    }
  }

  return lines.join('\n');
}
