import { useState, useCallback, type KeyboardEvent } from 'react';

interface InputBarProps {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function InputBar({ onSend, placeholder = 'Ask about this component...', disabled = false }: InputBarProps) {
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-bg">
      <input
        type="text"
        className="flex-1 bg-bg-secondary border border-border rounded-md px-3 py-1.5 text-12 text-fg placeholder:text-fg-disabled outline-none focus:border-bg-brand transition-colors"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        className="flex items-center justify-center w-7 h-7 rounded-md bg-bg-brand text-fg-onbrand hover:opacity-90 disabled:opacity-40 transition-opacity"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        title="Send"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
