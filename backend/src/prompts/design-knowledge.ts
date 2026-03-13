import type { DesignSystemContext } from '../services/design-knowledge.js';

/**
 * Build a prompt section with MCP-sourced design system knowledge.
 * Injected into the AI review prompt as verification context.
 */
export function buildDesignKnowledgeSection(ctx: DesignSystemContext): string {
  const sourceList = ctx.sources.map(s => s.title).join(', ');

  return `## Design System Reference (authoritative sources)

${ctx.guidelines}

---
Sources: ${sourceList}

IMPORTANT: Use the above reference to validate your findings. If your assessment contradicts these established guidelines, defer to the guidelines and note the discrepancy.`;
}
