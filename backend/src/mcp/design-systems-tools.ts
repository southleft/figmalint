import { getDesignSystemsClient } from './design-systems-client.js';
import { parseToolResult } from './parse-tool-result.js';

// ── Types ──────────────────────────────────────────────

export interface DesignKnowledgeEntry {
  title: string;
  content: string;
  category: string;
  tags: string[];
  relevance?: number;
}

export interface DesignKnowledgeChunk {
  content: string;
  source: string;
  relevance?: number;
}

type KnowledgeCategory =
  | 'components'
  | 'tokens'
  | 'patterns'
  | 'workflows'
  | 'guidelines'
  | 'general';

// ── Tool wrappers ──────────────────────────────────────

/**
 * Semantic search across 188+ curated design system entries.
 */
export async function searchDesignKnowledge(params: {
  query: string;
  category?: KnowledgeCategory;
  tags?: string[];
  limit?: number;
}): Promise<DesignKnowledgeEntry[]> {
  const client = await getDesignSystemsClient();
  if (!client) return [];

  try {
    const result = await client.callTool({
      name: 'search_design_knowledge',
      arguments: {
        query: params.query,
        ...(params.category && { category: params.category }),
        ...(params.tags && { tags: params.tags }),
        limit: params.limit ?? 5,
      },
    });

    const text = extractText(result);
    if (!text) return [];
    return parseEntries(text);
  } catch (error) {
    console.warn('search_design_knowledge failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Granular chunk-level search for specific information.
 */
export async function searchChunks(params: {
  query: string;
  limit?: number;
}): Promise<DesignKnowledgeChunk[]> {
  const client = await getDesignSystemsClient();
  if (!client) return [];

  try {
    const result = await client.callTool({
      name: 'search_chunks',
      arguments: {
        query: params.query,
        limit: params.limit ?? 8,
      },
    });

    const parsed = parseToolResult(result);
    if (Array.isArray(parsed)) return parsed;

    const text = extractText(result);
    if (!text) return [];
    return [{ content: text, source: 'Design Systems MCP' }];
  } catch (error) {
    console.warn('search_chunks failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Browse entries by category.
 */
export async function browseByCategory(
  category: KnowledgeCategory,
): Promise<DesignKnowledgeEntry[]> {
  const client = await getDesignSystemsClient();
  if (!client) return [];

  try {
    const result = await client.callTool({
      name: 'browse_by_category',
      arguments: { category },
    });

    const text = extractText(result);
    if (!text) return [];
    return parseEntries(text);
  } catch (error) {
    console.warn('browse_by_category failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * List all available tags in the knowledge base.
 */
export async function getAllTags(): Promise<string[]> {
  const client = await getDesignSystemsClient();
  if (!client) return [];

  try {
    const result = await client.callTool({
      name: 'get_all_tags',
      arguments: {},
    });

    const parsed = parseToolResult(result);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (error) {
    console.warn('get_all_tags failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ── Helpers ────────────────────────────────────────────

/** Extract text from MCP tool result content array. */
function extractText(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (!r.content?.length) return null;
  const textBlock = r.content.find(c => c.type === 'text');
  return textBlock?.text ?? null;
}

/** Parse markdown-formatted MCP results into structured entries. */
function parseEntries(text: string): DesignKnowledgeEntry[] {
  const entries: DesignKnowledgeEntry[] = [];

  // MCP returns markdown-formatted blocks like:
  // 🔍 1. Title
  // 📂 Category: ...
  // 🏷️ Tags: ...
  // Content...
  const blocks = text.split(/🔍\s*\d+\.\s*/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split('\n');
    const title = lines[0]?.replace(/<[^>]*>/g, '').trim() || 'Unknown';

    const categoryMatch = block.match(/📂\s*Category:\s*(.+)/i);
    const tagsMatch = block.match(/🏷️\s*Tags:\s*(.+)/i);

    const category = categoryMatch?.[1]?.trim() || 'general';
    const tags = tagsMatch?.[1]?.split(',').map((t: string) => t.trim()).filter(Boolean) || [];

    // Content is everything after the metadata lines
    const contentLines = lines.filter(
      (l: string) => !l.match(/^(📂|🏷️|🔖|📊|✅)/) && l.trim(),
    );
    const content = contentLines.slice(1).join('\n').trim();

    if (title !== 'Unknown' || content) {
      entries.push({ title, content, category, tags });
    }
  }

  return entries;
}
