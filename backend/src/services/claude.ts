import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../prompts/system.js';
import { PAGE_TYPE_PROMPT } from '../prompts/page-type.js';
import { buildReviewPrompt } from '../prompts/review.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MODEL = 'claude-sonnet-4-20250514';

/**
 * Detect the page type from a screenshot.
 */
export async function detectPageType(screenshotBase64: string): Promise<string> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
          },
          { type: 'text', text: PAGE_TYPE_PROMPT },
        ],
      },
    ],
  });

  if (!response.content.length || response.content[0].type !== 'text') {
    return 'other';
  }
  return response.content[0].text.trim().toLowerCase();
}

interface AiReviewCategory {
  rating: 'pass' | 'needs_improvement' | 'fail';
  evidence: string[];
  recommendation: string | null;
}

interface AiReviewResult {
  visualHierarchy: AiReviewCategory;
  statesCoverage: AiReviewCategory & { missingStates: string[] };
  platformAlignment: AiReviewCategory & { detectedPlatform: string };
  colorHarmony: AiReviewCategory;
  recommendations: Array<{ title: string; description: string; severity: string }>;
  summary: string;
}

const VALID_RATINGS = new Set(['pass', 'needs_improvement', 'fail']);

function normalizeCategory(raw: any): AiReviewCategory {
  return {
    rating: VALID_RATINGS.has(raw?.rating) ? raw.rating : 'fail',
    evidence: Array.isArray(raw?.evidence) ? raw.evidence : [],
    recommendation: typeof raw?.recommendation === 'string' ? raw.recommendation : null,
  };
}

/**
 * Generate a rubric-based design review from a screenshot + lint context.
 */
export async function generateReview(
  screenshotBase64: string,
  lintSummary: string,
  componentInfo: string
): Promise<AiReviewResult> {
  const anthropic = getClient();
  const prompt = buildReviewPrompt(lintSummary, componentInfo);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
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
    throw new Error('Empty response from AI review');
  }
  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in review response');

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate and normalize to rubric format
  if (!parsed.visualHierarchy || !parsed.colorHarmony) {
    throw new Error('AI review missing required categories');
  }

  const statesCov = normalizeCategory(parsed.statesCoverage);
  const platformAl = normalizeCategory(parsed.platformAlignment);

  return {
    visualHierarchy: normalizeCategory(parsed.visualHierarchy),
    statesCoverage: {
      ...statesCov,
      missingStates: Array.isArray(parsed.statesCoverage?.missingStates) ? parsed.statesCoverage.missingStates : [],
    },
    platformAlignment: {
      ...platformAl,
      detectedPlatform: typeof parsed.platformAlignment?.detectedPlatform === 'string'
        ? parsed.platformAlignment.detectedPlatform
        : 'web',
    },
    colorHarmony: normalizeCategory(parsed.colorHarmony),
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}

/**
 * Stream a chat response given conversation history.
 */
export async function* streamChat(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  screenshotBase64?: string
): AsyncGenerator<string, void, undefined> {
  const anthropic = getClient();

  // Build messages with optional screenshot in the first user message
  const apiMessages: Anthropic.MessageParam[] = messages.map((m, i) => {
    if (i === 0 && screenshotBase64 && m.role === 'user') {
      return {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: 'image/png' as const, data: screenshotBase64 },
          },
          { type: 'text' as const, text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: apiMessages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}
