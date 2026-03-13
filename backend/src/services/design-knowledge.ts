import { searchDesignKnowledge, type DesignKnowledgeEntry } from '../mcp/design-systems-tools.js';

// ── Types ──────────────────────────────────────────────

export interface SourceReference {
  title: string;
  category: string;
  tags: string[];
}

export interface DesignSystemContext {
  /** Formatted text for LLM prompt injection */
  guidelines: string;
  /** Source references for Thesis #50 */
  sources: SourceReference[];
}

// ── Cache ──────────────────────────────────────────────

const cache = new Map<string, { context: DesignSystemContext; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Main function ──────────────────────────────────────

/**
 * Fetch design system knowledge from the MCP server for a given component.
 * Returns null if MCP is unavailable (graceful degradation).
 */
export async function fetchDesignSystemContext(
  componentName: string,
  componentFamily?: string,
): Promise<DesignSystemContext | null> {
  const cacheKey = `${componentFamily || componentName}`.toLowerCase();

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.context;
  }

  // Fire two searches in parallel:
  // 1) Component-specific best practices
  // 2) Accessibility/WCAG guidance for this component type
  const searchTerm = componentFamily || componentName;

  const [componentResults, a11yResults] = await Promise.all([
    searchDesignKnowledge({
      query: `${searchTerm} component design best practices`,
      category: 'components',
      limit: 4,
    }),
    searchDesignKnowledge({
      query: `${searchTerm} accessibility WCAG requirements`,
      category: 'guidelines',
      limit: 3,
    }),
  ]);

  const allResults = [...componentResults, ...a11yResults];
  if (allResults.length === 0) return null;

  const context = buildContext(allResults);

  cache.set(cacheKey, { context, timestamp: Date.now() });
  return context;
}

// ── Helpers ────────────────────────────────────────────

function buildContext(entries: DesignKnowledgeEntry[]): DesignSystemContext {
  // Deduplicate by title
  const seen = new Set<string>();
  const unique = entries.filter(e => {
    if (seen.has(e.title)) return false;
    seen.add(e.title);
    return true;
  });

  const guidelines = unique
    .map(e => {
      const header = `### ${e.title} [${e.category}]`;
      // Truncate long content to keep prompt concise
      const body = e.content.length > 600
        ? e.content.slice(0, 600) + '...'
        : e.content;
      return `${header}\n${body}`;
    })
    .join('\n\n');

  const sources: SourceReference[] = unique.map(e => ({
    title: e.title,
    category: e.category,
    tags: e.tags,
  }));

  return { guidelines, sources };
}
