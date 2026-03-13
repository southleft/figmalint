import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../lib/messages';
import AiMessage from '../messages/AiMessage';
import ScoreCard from '../messages/ScoreCard';
import IssuesList from '../messages/IssuesList';
import FixResult from '../messages/FixResult';
import AiReviewCard from '../messages/AiReviewCard';
import ReferoGallery from '../messages/ReferoGallery';
import ActionButtons from '../shared/ActionButtons';

interface MessageListProps {
  messages: ChatMessage[];
  onAction: (action: string, params?: Record<string, unknown>) => void;
  onJumpToNode: (nodeId: string) => void;
}

export default function MessageList({ messages, onAction, onJumpToNode }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-[40px] mb-3">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-fg-tertiary">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-13 font-medium text-fg mb-1">Design Review Chat</p>
          <p className="text-11 text-fg-secondary">Select a component or frame and press<br /><strong>Analyze</strong> to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
      {messages.map((msg) => {
        const m = msg.message;
        switch (m.kind) {
          case 'ai-text':
            return <AiMessage key={msg.id} content={m.content} />;
          case 'user-text':
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="bg-bg-brand text-fg-onbrand rounded-xl rounded-br-sm px-3 py-2 text-12 max-w-[85%]">
                  {m.content}
                </div>
              </div>
            );
          case 'score-card':
            return <ScoreCard key={msg.id} data={m.data} />;
          case 'issues-list':
            return <IssuesList key={msg.id} errors={m.data} onJumpToNode={onJumpToNode} />;
          case 'fix-result':
            return <FixResult key={msg.id} data={m.data} />;
          case 'action-buttons':
            return <ActionButtons key={msg.id} buttons={m.buttons} onAction={onAction} />;
          case 'batch-summary':
            return (
              <div key={msg.id} className="bg-bg-success rounded-xl px-3 py-2 text-12">
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-success shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>
                    <strong>{m.data.applied}</strong> of {m.data.total} fixes applied
                    {m.data.failed > 0 && <span className="text-fg-danger"> ({m.data.failed} failed)</span>}
                  </span>
                </div>
              </div>
            );
          case 'ai-review':
            return <AiReviewCard key={msg.id} data={m.data} />;
          case 'refero-gallery':
            return <ReferoGallery key={msg.id} data={m.data} />;
          case 'combined-score': {
            const lintPct = Math.round(m.data.lintScore);
            const aiPct = Math.round(m.data.aiScore);
            return (
              <div key={msg.id} className="bg-bg-secondary rounded-xl px-3 py-2 text-12 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Combined Score</span>
                  <span className={`text-[18px] font-bold tabular-nums ${m.data.combined >= 80 ? 'text-fg-success' : m.data.combined >= 50 ? 'text-fg-warning' : 'text-fg-danger'}`}>
                    {Math.round(m.data.combined)}
                  </span>
                </div>
                <div className="flex gap-3 text-11 text-fg-secondary">
                  <span>Lint: {lintPct}</span>
                  <span>AI: {aiPct}</span>
                </div>
              </div>
            );
          }
          case 'score-update': {
            const diff = m.data.newScore - m.data.oldScore;
            const arrow = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : '\u2192';
            const color = diff > 0 ? 'text-fg-success' : diff < 0 ? 'text-fg-danger' : 'text-fg-secondary';
            return (
              <div key={msg.id} className="bg-bg-secondary rounded-xl px-3 py-2 text-12">
                <span className={color}>
                  Score: {m.data.oldScore} {arrow} {m.data.newScore} ({diff > 0 ? '+' : ''}{diff})
                </span>
                {m.data.issuesRemaining > 0 && (
                  <span className="text-fg-secondary ml-2">
                    {m.data.issuesRemaining} issue{m.data.issuesRemaining !== 1 ? 's' : ''} remaining
                  </span>
                )}
              </div>
            );
          }
          default:
            return null;
        }
      })}
      <div ref={endRef} />
    </div>
  );
}
