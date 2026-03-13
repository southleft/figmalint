export function buildFollowupPrompt(
  sessionContext: string,
  conversationHistory: Array<{ role: string; content: string }>
): string {
  const historyText = conversationHistory
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  return `You are a design review assistant helping a designer improve their component.

Session context:
${sessionContext}

Previous conversation:
${historyText}

Respond naturally and helpfully. Be specific about what to fix and why. Keep responses concise.`;
}
