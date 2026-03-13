import { searchScreens, getDesignGuidance, type ReferoScreen, type DesignGuidance } from '../mcp/refero-tools.js';
import { buildReferoComparePrompt } from '../prompts/refero-compare.js';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../prompts/system.js';

const MODEL = 'claude-sonnet-4-20250514';

export interface ReferoComparison {
  matchingPatterns: Array<{ pattern: string; frequency: string }>;
  missingPatterns: Array<{ pattern: string; frequency: string; exampleCompanies: string[] }>;
  stylePositioning: { closest: string[]; different: string[] };
  suggestions: Array<{ title: string; description: string; evidence: string }>;
  summary: string;
  screenshots: ReferoScreen[];
}

/**
 * Run Refero comparison: search for examples, get guidance, then analyze with Claude.
 * Returns null if Refero is unavailable (graceful degradation).
 */
export async function runReferoComparison(
  pageType: string,
  componentInfo: string,
  screenshotBase64: string,
  anthropicClient: Anthropic,
): Promise<ReferoComparison | null> {
  // Fetch Refero data in parallel: search + guidance
  const [screens, guidance] = await Promise.all([
    searchScreens({
      query: `${pageType} page best practices`,
      page_type: pageType,
      limit: 10,
    }),
    getDesignGuidance({ page_type: pageType }),
  ]);

  // If no screens found, Refero is likely unavailable
  if (screens.length === 0) {
    return null;
  }

  // Build comparison prompt
  const prompt = buildReferoComparePrompt(
    pageType,
    componentInfo,
    screens,
    guidance?.commonPatterns,
  );

  // Use Claude to compare the design with Refero examples
  try {
    const response = await anthropicClient.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    if (!response.content.length || response.content[0].type !== 'text') {
      return null;
    }

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      matchingPatterns: parsed.matchingPatterns || [],
      missingPatterns: parsed.missingPatterns || [],
      stylePositioning: parsed.stylePositioning || { closest: [], different: [] },
      suggestions: parsed.suggestions || [],
      summary: parsed.summary || '',
      screenshots: screens,
    };
  } catch (error) {
    console.warn('Refero comparison analysis failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
