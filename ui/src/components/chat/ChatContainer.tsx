import { useCallback } from 'react';
import StickyHeader from './StickyHeader';
import MessageList from './MessageList';
import InputBar from './InputBar';
import QuickActions from '../shared/QuickActions';
import type { ChatState } from '../../hooks/useChat';

interface ChatContainerProps {
  state: ChatState;
  componentName?: string;
  analysisMode?: 'quick' | 'deep';
  onAnalyze: () => void;
  onSendMessage: (text: string) => void;
  onAction: (action: string, params?: Record<string, unknown>) => void;
  onJumpToNode: (nodeId: string) => void;
  onOpenSettings?: () => void;
}

export default function ChatContainer({
  state,
  componentName,
  analysisMode,
  onAnalyze,
  onSendMessage,
  onAction,
  onJumpToNode,
  onOpenSettings,
}: ChatContainerProps) {
  const { messages, score, lintResult, isAnalyzing, issuesFixed } = state;
  const totalIssues = lintResult?.summary.totalErrors || 0;
  const hasResults = messages.length > 0;

  const handleAction = useCallback(
    (action: string, params?: Record<string, unknown>) => {
      if (action === 'rescan') {
        onAnalyze();
      } else {
        onAction(action, params);
      }
    },
    [onAnalyze, onAction]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header with score */}
      <StickyHeader
        componentName={componentName}
        score={score}
        totalIssues={totalIssues}
        issuesFixed={issuesFixed}
        onOpenSettings={onOpenSettings}
      />

      {/* Message stream */}
      {isAnalyzing ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-6 h-6 border-2 border-bg-brand border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-12 text-fg-secondary">Analyzing...</p>
          </div>
        </div>
      ) : (
        <MessageList messages={messages} onAction={handleAction} onJumpToNode={onJumpToNode} />
      )}

      {/* Bottom bar */}
      <div>
        {hasResults && (
          <QuickActions
            onAnalyze={onAnalyze}
            hasFixable={(lintResult?.errors.filter(e => e.errorType === 'spacing').length || 0) > 0}
            analysisMode={analysisMode}
            onAction={handleAction}
          />
        )}
        <InputBar onSend={onSendMessage} disabled={isAnalyzing} />
      </div>
    </div>
  );
}
