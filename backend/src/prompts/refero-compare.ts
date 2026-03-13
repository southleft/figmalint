import type { ReferoScreen } from '../mcp/refero-tools.js';

/**
 * Build a prompt for comparing the user's design with Refero examples.
 */
export function buildReferoComparePrompt(
  pageType: string,
  componentInfo: string,
  referoScreens: ReferoScreen[],
  patterns?: Array<{ pattern: string; frequency: string }>
): string {
  const screenList = referoScreens
    .map((s, i) => `${i + 1}. "${s.title}" by ${s.company} (${s.platform})${s.tags?.length ? ` — tags: ${s.tags.join(', ')}` : ''}`)
    .join('\n');

  const patternList = patterns?.length
    ? patterns.map(p => `- ${p.pattern}: ${p.frequency}`).join('\n')
    : 'No pattern data available';

  return `You are a senior product designer. Compare the analyzed design with best-practice examples from Refero (a library of 124K+ real product screens).

## Analyzed Design
${componentInfo}
Page type: ${pageType}

## Refero Examples (top ${referoScreens.length} matches for "${pageType}")
${screenList}

## Common Patterns for ${pageType} pages
${patternList}

## Tasks
1. Identify matching patterns — what does this design already do well compared to industry examples?
2. Identify missing patterns — what common patterns from top products are absent?
3. Style positioning — which products/companies have the most similar design language?
4. Give 2-3 actionable suggestions based on what the best examples do differently.

## Response Format (JSON)
{
  "matchingPatterns": [
    { "pattern": "<pattern name>", "frequency": "<e.g. 73% of similar pages>" }
  ],
  "missingPatterns": [
    { "pattern": "<pattern name>", "frequency": "<e.g. 68% of similar pages>", "exampleCompanies": ["<company1>", "<company2>"] }
  ],
  "stylePositioning": {
    "closest": ["<company/product with most similar style>"],
    "different": ["<company/product with notably different approach>"]
  },
  "suggestions": [
    { "title": "<short title>", "description": "<specific suggestion based on Refero data>", "evidence": "<what % of examples do this>" }
  ],
  "summary": "<2-3 sentence comparison summary>"
}`;
}
