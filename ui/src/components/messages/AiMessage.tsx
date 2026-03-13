import type { ReactNode } from 'react';

interface AiMessageProps {
  content: string;
}

/**
 * Parse **bold** markers into React elements safely (no innerHTML).
 */
function parseBold(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Render AI message text with basic markdown-like formatting.
 * Supports **bold** and line breaks — no dangerouslySetInnerHTML.
 */
export default function AiMessage({ content }: AiMessageProps) {
  const lines = content.split('\n');

  return (
    <div className="bg-bg-secondary rounded-xl rounded-bl-sm px-3 py-2 text-12 text-fg max-w-[90%]">
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {parseBold(line)}
        </span>
      ))}
    </div>
  );
}
