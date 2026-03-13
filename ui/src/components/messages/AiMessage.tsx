interface AiMessageProps {
  content: string;
}

/**
 * Render AI message text with basic markdown-like formatting.
 * Supports **bold** and line breaks.
 */
export default function AiMessage({ content }: AiMessageProps) {
  const parts = content.split('\n').map((line, i) => {
    // Simple bold parsing
    const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return (
      <span key={i}>
        {i > 0 && <br />}
        <span dangerouslySetInnerHTML={{ __html: formatted }} />
      </span>
    );
  });

  return (
    <div className="bg-bg-secondary rounded-xl rounded-bl-sm px-3 py-2 text-12 text-fg max-w-[90%]">
      {parts}
    </div>
  );
}
