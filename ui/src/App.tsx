import { useState, useCallback, useEffect } from 'react';
import ChatContainer from './components/chat/ChatContainer';
import { useChat } from './hooks/useChat';
import { usePluginMessages, usePostToPlugin } from './hooks/usePluginMessages';
import type { PluginEvent, LintResult, LintError } from './lib/messages';

export default function App() {
  const chat = useChat();
  const post = usePostToPlugin();
  const [componentName, setComponentName] = useState<string | undefined>();
  const [hasApiKey, setHasApiKey] = useState(false);

  // Listen for messages from the plugin main thread
  usePluginMessages(
    useCallback(
      (event: PluginEvent) => {
        switch (event.type) {
          case 'design-lint-result':
            chat.handleLintResult(event.data as LintResult);
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
          case 'api-key-status':
            setHasApiKey((event.data as any)?.hasKey || false);
            break;
        }
      },
      [chat]
    )
  );

  // Check API key on mount
  useEffect(() => {
    post('check-api-key');
  }, [post]);

  const handleAnalyze = useCallback(() => {
    chat.startAnalysis();
    post('run-design-lint');
  }, [chat, post]);

  const handleSendMessage = useCallback(
    (text: string) => {
      chat.addMessage({ kind: 'user-text', content: text });
      // For now, send as chat message to plugin (AI will handle in Sprint 3)
      post('chat-message', { message: text });
    },
    [chat, post]
  );

  const handleAction = useCallback(
    (action: string, params?: Record<string, unknown>) => {
      switch (action) {
        case 'fix-all': {
          // Fix all spacing issues
          const spacingErrors = chat.lintResult?.errors.filter(
            (e: LintError) => e.errorType === 'spacing'
          );
          if (spacingErrors && spacingErrors.length > 0) {
            chat.addMessage({
              kind: 'ai-text',
              content: `Applying ${spacingErrors.length} spacing fixes...`,
            });
            // Apply fixes one by one (batch in Sprint 2)
            for (const err of spacingErrors) {
              // Parse spacing suggestion from the value
              const match = err.value.match(/(\d+)px/);
              if (match) {
                post('fix-spacing', {
                  nodeId: err.nodeId,
                  property: 'itemSpacing', // simplified; real impl should track property
                  value: parseInt(match[1]),
                });
              }
            }
          }
          break;
        }
        case 'walkthrough': {
          const firstIssue = chat.lintResult?.errors[0];
          if (firstIssue) {
            chat.addMessage({
              kind: 'ai-text',
              content: `**1/${chat.lintResult?.errors.length}:** ${firstIssue.message}\n\nLayer: ${firstIssue.nodeName}`,
            });
            post('jump-to-node', { nodeId: firstIssue.nodeId });
          }
          break;
        }
        case 'export': {
          // Export as markdown (simplified for Sprint 1)
          const result = chat.lintResult;
          if (result) {
            const md = buildMarkdownExport(result, componentName);
            navigator.clipboard.writeText(md).then(() => {
              chat.addMessage({
                kind: 'ai-text',
                content: 'Lint report copied to clipboard!',
              });
            });
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

function buildMarkdownExport(result: LintResult, componentName?: string): string {
  const lines = [
    `# Design Lint Report: ${componentName || 'Component'}`,
    '',
    `Score: ${result.summary.totalErrors} issues across ${result.summary.nodesWithErrors} layers`,
    '',
    '## Issues',
    '',
  ];

  for (const err of result.errors) {
    lines.push(`- **[${err.errorType.toUpperCase()}]** ${err.nodeName}: ${err.message}`);
  }

  return lines.join('\n');
}
