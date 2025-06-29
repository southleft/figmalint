/// <reference types="@figma/plugin-typings" />

import { ClaudeAPIRequest, ClaudeAPIResponse, ComponentContext } from '../types';

// Claude API Configuration
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-3-sonnet-20240229';
const MAX_TOKENS = 2048;

// Deterministic settings for consistency
const DETERMINISTIC_CONFIG = {
  temperature: 0.1, // Low temperature for consistency
  top_p: 0.1,      // Low top_p for deterministic responses
};

/**
 * Send a prompt to Claude API and get a response with deterministic settings
 */
export async function fetchClaude(prompt: string, apiKey: string, model: string = DEFAULT_MODEL, isDeterministic: boolean = true): Promise<string> {
  console.log('Making Claude API call with deterministic settings...');

  // Prepare the request payload for Anthropic API
  const requestBody: ClaudeAPIRequest = {
    model,
    messages: [
      {
        role: 'user',
        content: prompt.trim()
      }
    ],
    max_tokens: MAX_TOKENS,
    // Add deterministic parameters for consistent responses
    ...(isDeterministic ? DETERMINISTIC_CONFIG : {})
  };

  // Headers for direct Anthropic API request
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey.trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };

  try {
    console.log('Sending request to Claude API...');
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error response:', errorText);
      throw new Error(`Claude API request failed: ${response.status} ${response.statusText}`);
    }

    const data: ClaudeAPIResponse = await response.json();
    console.log('Claude API response:', data);

    if (data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text.trim();
    } else {
      throw new Error('Invalid response format from Claude API');
    }
  } catch (error) {
    console.error('Error calling Claude API:', error);

    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Failed to connect to Claude API. Please check your internet connection.');
      } else if (error.message.includes('401')) {
        throw new Error('Invalid API key. Please check your Claude API key.');
      } else if (error.message.includes('429')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
    }
    throw error;
  }
}

/**
 * Create a comprehensive metadata analysis prompt for Figma components
 */
export function createEnhancedMetadataPrompt(componentContext: ComponentContext): string {
  return `You are an expert design system architect analyzing a Figma component for comprehensive metadata and design token recommendations.

**Component Analysis Context:**
- Component Name: ${componentContext.name}
- Component Type: ${componentContext.type}
- Layer Structure: ${JSON.stringify(componentContext.hierarchy, null, 2)}
- Detected Colors: ${componentContext.colors && componentContext.colors.length > 0 ? componentContext.colors.join(', ') : 'None detected'}
- Detected Spacing: ${componentContext.spacing && componentContext.spacing.length > 0 ? componentContext.spacing.join(', ') : 'None detected'}
- Text Content: ${componentContext.textContent || 'No text content'}

**Additional Context & Considerations:**
${componentContext.additionalContext ? `
- Component Family: ${componentContext.additionalContext.componentFamily || 'Generic'}
- Possible Use Case: ${componentContext.additionalContext.possibleUseCase || 'Unknown'}
- Has Interactive Elements: ${componentContext.additionalContext.hasInteractiveElements ? 'Yes' : 'No'}
- Design Patterns: ${componentContext.additionalContext.designPatterns.join(', ') || 'None identified'}
- Considerations: ${componentContext.additionalContext.suggestedConsiderations.join('; ') || 'None'}
` : '- No additional context available'}

**IMPORTANT: This is a FIGMA DESIGN component analysis, not code implementation.**
Focus on design system concerns that can be addressed in Figma, not development implementation details.

**Analysis Requirements:**

1. **Component Metadata**: Provide comprehensive component documentation for design handoff
2. **Design Token Analysis**: Analyze and recommend semantic design tokens
3. **Design Consistency**: Evaluate design system compliance within Figma
4. **Naming Convention Review**: Check layer naming consistency
5. **Design System Integration**: Suggest improvements for scalability
6. **MCP Server Compatibility**: Ensure component structure supports automated code generation

**Figma-Specific Focus Areas:**
- **Component Structure**: How layers are organized and named
- **Token Usage**: Replace hard-coded values with Figma variables/tokens
- **Visual States**: Design states that should exist in Figma (hover, focus, disabled representations)
- **Variant Organization**: When and how to use Figma component variants
- **Design Handoff**: Information developers need to implement this design

**Container Component Guidelines:**
- If this appears to be a CONTAINER component (e.g., "tabs", "form", "card-group"), focus on layout and organization rather than interaction variants
- Container components typically need fewer variants than individual interactive components
- Only suggest variants for containers if they truly have different layout patterns (e.g., vertical vs horizontal orientation)

**Variant Recommendations Guidelines:**
- Do NOT recommend variants for components that are intentionally single-purpose (icons, badges, simple dividers, containers)
- Only suggest variants when there's clear evidence the component should have multiple visual or functional states
- For CONTAINER components: Focus on layout variants (orientation, spacing) rather than interaction states
- For INDIVIDUAL components: Consider interaction states, sizes, and visual styles
- Base variant suggestions on actual design system patterns visible in the layer structure

**Design Token Focus Areas:**
- **Color Tokens**: Semantic color usage (primary, secondary, neutral, semantic colors)
- **Spacing Tokens**: Consistent spacing patterns (padding, margins, gaps)
- **Typography Tokens**: Font sizes, weights, line heights, letter spacing
- **Effect Tokens**: Shadows, blurs, and other visual effects
- **Border Tokens**: Border radius, stroke weights
- **Layout Tokens**: Grid systems, breakpoints, container sizes

**Response Format (JSON only):**
{
  "component": "Component name and purpose",
  "description": "Detailed component description and use cases",
  "props": [
    {
      "name": "property name",
      "type": "string|boolean|number|variant",
      "description": "Property purpose and usage",
      "defaultValue": "default value",
      "required": true/false
    }
  ],
  "states": ["IMPORTANT: Only include visual states that can be represented in Figma designs (hover, focus, disabled, loading, error). Do NOT include states that are purely functional/code-level."],
  "slots": ["slot descriptions for content areas"],
  "variants": {
    "size": ["small", "medium", "large"],
    "variant": ["primary", "secondary", "outline"],
    "orientation": ["horizontal", "vertical"]
  },
  "usage": "When and how to use this component in designs",
  "accessibility": {
    "designConsiderations": ["Design-focused accessibility considerations like color contrast, visual hierarchy, readable text sizes"],
    "visualIndicators": ["Visual cues needed for accessibility (focus rings, state indicators, etc.)"],
    "designGuidance": "How to design this component to be accessible"
  },
  "tokens": {
    "colors": [
      "semantic-color-primary",
      "semantic-color-secondary",
      "neutral-background-default",
      "neutral-text-primary",
      "semantic-color-success",
      "semantic-color-error",
      "semantic-color-warning"
    ],
    "spacing": [
      "spacing-xs-4px",
      "spacing-sm-8px",
      "spacing-md-16px",
      "spacing-lg-24px",
      "spacing-xl-32px"
    ],
    "typography": [
      "text-size-sm-12px",
      "text-size-base-14px",
      "text-size-lg-16px",
      "text-size-xl-18px",
      "text-weight-normal-400",
      "text-weight-medium-500",
      "text-weight-semibold-600"
    ],
    "effects": [
      "shadow-sm-subtle",
      "shadow-md-default",
      "shadow-lg-prominent",
      "blur-backdrop-light"
    ],
    "borders": [
      "radius-sm-4px",
      "radius-md-8px",
      "radius-lg-12px",
      "radius-full-999px"
    ]
  },
  "propertyCheatSheet": [
    {
      "name": "Property name",
      "values": ["value1", "value2", "value3"],
      "default": "default value",
      "description": "What this property controls"
    }
  ],
  "audit": {
    "designIssues": ["Specific design consistency issues found in Figma"],
    "namingIssues": ["Layer naming problems with suggestions for better organization"],
    "tokenOpportunities": ["Specific recommendations for design token implementation in Figma"],
    "structureIssues": ["Component structure improvements for better design system integration"]
  },
  "mcpReadiness": {
    "score": "0-100 readiness score for MCP server code generation",
    "strengths": [
      "REQUIRED: List 2-3 specific strengths this component already has for code generation",
      "Examples: 'Clear component structure', 'Good naming conventions', 'Semantic layer hierarchy', 'Uses design tokens', 'Has defined visual states', 'Well-organized component variants'"
    ],
    "gaps": [
      "REQUIRED: List 2-4 specific gaps that limit MCP code generation effectiveness",
      "Examples: 'Missing visual states in Figma', 'Hard-coded spacing values', 'Unclear component variants', 'Inconsistent layer naming', 'No component properties defined'"
    ],
    "recommendations": [
      "REQUIRED: List 2-4 specific, actionable DESIGN recommendations to improve MCP readiness",
      "Examples: 'Add hover and focus state designs', 'Replace hard-coded spacing with Figma variables', 'Define component variant properties', 'Standardize layer naming convention', 'Create missing visual states'"
    ],
    "implementationNotes": "Design handoff guidance for developers implementing this component"
  }
}

**Analysis Guidelines:**

1. **Be Figma-Specific**: Focus on what can be improved within Figma designs
2. **Design System Focus**: Consider how this fits into a broader design system
3. **Visual Design**: Prioritize visual consistency, token usage, and design handoff
4. **Component Architecture**: Evaluate how the component is structured in Figma
5. **Practical Recommendations**: Suggest improvements that designers can actually implement

**AVOID Development-Only Concerns:**
- Do NOT suggest implementing ARIA attributes (this is code-level)
- Do NOT suggest adding keyboard navigation (this is code-level)
- Do NOT suggest functional programming patterns
- Focus on VISUAL and DESIGN SYSTEM concerns only

**Token Naming Convention:**
- Colors: \`semantic-[purpose]-[variant]\` (e.g., "semantic-color-primary", "neutral-background-subtle")
- Spacing: \`spacing-[size]-[value]\` (e.g., "spacing-md-16px", "spacing-lg-24px")
- Typography: \`text-[property]-[variant]-[value]\` (e.g., "text-size-lg-18px", "text-weight-semibold-600")
- Effects: \`[effect]-[intensity]-[purpose]\` (e.g., "shadow-md-default", "blur-backdrop-light")
- Borders: \`radius-[size]-[value]\` (e.g., "radius-md-8px", "radius-full-999px")

Focus on creating a comprehensive DESIGN analysis that helps designers build scalable, consistent, and well-structured Figma components.`;
}

/**
 * Create a basic component analysis prompt
 */
export function createDesignAnalysisPrompt(componentName: string, componentStructure: any): string {
  return `
Analyze this Figma component and provide design insights:

Component Name: ${componentName}
Component Structure: ${JSON.stringify(componentStructure, null, 2)}

Please provide:
1. A brief description of the component's purpose and design
2. Suggestions for potential variants (different states, sizes, or styles)
3. Accessibility considerations
4. Best practices for using this component

Keep the response concise and actionable for a designer.
  `.trim();
}

/**
 * Extract JSON from Claude response with improved parsing
 */
export function extractJSONFromResponse(response: string): any {
  try {
    console.log('🔍 Starting JSON extraction from Claude response...');
    console.log('📝 Response length:', response.length);
    console.log('📝 Response preview (first 200 chars):', response.substring(0, 200));

    // First, try parsing the entire response as JSON
    try {
      const parsed = JSON.parse(response.trim());
      console.log('✅ Successfully parsed entire response as JSON');
      return parsed;
    } catch (fullParseError) {
      console.log('⚠️ Full response is not valid JSON, trying to extract JSON block...');
    }

    // Try to find JSON blocks using multiple strategies
    const strategies = [
      // Strategy 1: Look for complete JSON objects with balanced braces
      () => extractBalancedJson(response),

      // Strategy 2: Look for JSON between common delimiters
      () => extractJsonBetweenDelimiters(response),

      // Strategy 3: Find JSON in code blocks
      () => extractJsonFromCodeBlocks(response),

      // Strategy 4: Last resort - original regex approach
      () => extractJsonWithRegex(response)
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`🔍 Trying extraction strategy ${i + 1}...`);
        const result = strategies[i]();
        if (result) {
          console.log('✅ Successfully extracted JSON with strategy', i + 1);
          return result;
        }
      } catch (strategyError) {
        const errorMessage = strategyError instanceof Error ? strategyError.message : 'Unknown error';
        console.log(`⚠️ Strategy ${i + 1} failed:`, errorMessage);
        continue;
      }
    }

    throw new Error('No valid JSON found in response after trying all strategies');

  } catch (error) {
    console.error('❌ Failed to parse JSON from Claude response:', error);
    console.log('📝 Full response for debugging:', response);
    throw new Error('Invalid JSON response from Claude API');
  }
}

/**
 * Extract JSON with balanced brace counting
 */
function extractBalancedJson(response: string): any | null {
  const firstBrace = response.indexOf('{');
  if (firstBrace === -1) return null;

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = firstBrace; i < response.length; i++) {
    const char = response[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          // Found complete JSON object
          const jsonStr = response.substring(firstBrace, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (parseError) {
            console.log('⚠️ Balanced JSON extraction found malformed JSON:', parseError instanceof Error ? parseError.message : 'Parse error');
            return null;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract JSON between common delimiters
 */
function extractJsonBetweenDelimiters(response: string): any | null {
  const delimiters = [
    ['```json', '```'],
    ['```', '```'],
    ['JSON:', '\n\n'],
    ['Response:', '\n\n'],
    ['{', '}\n'],
  ];

  for (const [start, end] of delimiters) {
    const startIndex = response.indexOf(start);
    if (startIndex === -1) continue;

    const jsonStart = startIndex + start.length;
    let endIndex = response.indexOf(end, jsonStart);

    if (endIndex === -1 && end === '\n\n') {
      // For cases where there's no double newline, use end of string
      endIndex = response.length;
    }

    if (endIndex === -1) continue;

    const jsonStr = response.substring(jsonStart, endIndex).trim();

    // Try to parse what we found
    try {
      return JSON.parse(jsonStr);
    } catch (parseError) {
      // If it starts with { but doesn't parse, try balanced extraction
      if (jsonStr.startsWith('{')) {
        try {
          return extractBalancedJson(jsonStr);
        } catch (balancedError) {
          continue;
        }
      }
    }
  }

  return null;
}

/**
 * Extract JSON from code blocks
 */
function extractJsonFromCodeBlocks(response: string): any | null {
  const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
  let match;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    try {
      return JSON.parse(match[1]);
    } catch (parseError) {
      continue;
    }
  }

  return null;
}

/**
 * Fallback regex extraction (original method)
 */
function extractJsonWithRegex(response: string): any | null {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return null;
}
