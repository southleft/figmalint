import { getReferoClient } from "./client.js";
import { parseToolResult } from './parse-tool-result.js';

/**
 * A screen result from Refero search.
 */
export interface ReferoScreen {
  id: string;
  title: string;
  company: string;
  pageType: string;
  thumbnailUrl: string;
  fullUrl: string;
  platform: 'web' | 'ios' | 'android';
  tags?: string[];
}

/**
 * Design guidance from Refero for a given page type.
 */
export interface DesignGuidance {
  pageType: string;
  commonPatterns: Array<{ pattern: string; frequency: string }>;
  bestPractices: string[];
  examples: ReferoScreen[];
}


/**
 * Search for screens matching a query.
 */
export async function searchScreens(params: {
  query: string;
  page_type?: string;
  pattern?: string;
  company?: string;
  platform?: 'web' | 'ios';
  limit?: number;
}): Promise<ReferoScreen[]> {
  const client = await getReferoClient();
  if (!client) return [];

  try {
    const result = await client.callTool({
      name: 'search_screens',
      arguments: {
        query: params.query,
        ...(params.page_type && { page_type: params.page_type }),
        ...(params.pattern && { pattern: params.pattern }),
        ...(params.company && { company: params.company }),
        ...(params.platform && { platform: params.platform }),
        limit: params.limit ?? 10,
      },
    });

    const parsed = parseToolResult(result) as ReferoScreen[] | null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Refero search_screens failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Get detailed info about a specific screen.
 */
export async function getScreen(screenId: string): Promise<ReferoScreen | null> {
  const client = await getReferoClient();
  if (!client) return null;

  try {
    const result = await client.callTool({
      name: 'get_screen',
      arguments: { id: screenId },
    });

    const parsed = parseToolResult(result) as ReferoScreen | null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Refero get_screen failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Get design guidance and best practices for a page type.
 */
export async function getDesignGuidance(params: {
  page_type: string;
  pattern?: string;
}): Promise<DesignGuidance | null> {
  const client = await getReferoClient();
  if (!client) return null;

  try {
    const result = await client.callTool({
      name: 'get_design_guidance',
      arguments: {
        page_type: params.page_type,
        ...(params.pattern && { pattern: params.pattern }),
      },
    });

    const parsed = parseToolResult(result) as DesignGuidance | null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Refero get_design_guidance failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
