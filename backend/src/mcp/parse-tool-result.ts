/**
 * Shared MCP tool result parser.
 * Extracts structured data from MCP JSON-RPC responses.
 */
export function parseToolResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return null;
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (!r.content?.length) return null;

  const textBlock = r.content.find(c => c.type === 'text');
  if (!textBlock?.text) return null;

  try {
    return JSON.parse(textBlock.text);
  } catch {
    return textBlock.text;
  }
}
