import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../lib/messages';
import AiMessage from '../messages/AiMessage';
import ScoreCard from '../messages/ScoreCard';
import IssuesList from '../messages/IssuesList';
import FixResult from '../messages/FixResult';
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
          default:
            return null;
        }
      })}
      <div ref={endRef} />
    </div>
  );
}
