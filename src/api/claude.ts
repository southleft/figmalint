/// <reference types="@figma/plugin-typings" />

import { ComponentContext } from '../types';
import { extractInstanceNames, serializeHierarchy } from '../core/component-analyzer';

/**
 * Create a comprehensive metadata analysis prompt for Figma components
 */
export function createEnhancedMetadataPrompt(componentContext: ComponentContext): string {
  return `You are an expert design system architect analyzing a Figma component for comprehensive metadata and design token recommendations.

**Component Analysis Context:**
- Component Name: ${componentContext.name}
- Component Type: ${componentContext.type}
- Layer Structure:
${serializeHierarchy(componentContext.hierarchy)}
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

**Existing Figma Description:**
${componentContext.existingDescription ? `"${componentContext.existingDescription}"\n(Build upon this if present, or create a comprehensive new description)` : 'None set — create a comprehensive description from scratch'}

- Nested Component Instances: ${extractInstanceNames(componentContext.hierarchy).join(', ') || 'None detected'}

**IMPORTANT: Focus on what makes this component ready for CODE GENERATION via MCP.**
Evaluate based on these criteria that actually matter for development:

**Analysis Requirements:**

1. **Component Properties**: Identify all configurable properties needed for flexibility
2. **Design Token Usage**: Analyze use of semantic tokens vs hard-coded values  
3. **Component States**: Document all interactive states (hover, focus, active, disabled, etc.)
4. **Component Boundaries**: Ensure clear component definition and structure
5. **Code Generation Readiness**: Assess how well the component can be translated to code
6. **MCP Compatibility**: Evaluate component structure for automated code generation

**Code Generation Focus Areas:**
- **Properties**: What can be configured when using this component
- **Token Usage**: Semantic tokens that maintain design consistency in code
- **States**: Interactive states that need to be implemented in code
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
  "description": "Start with a brief 1-2 sentence summary of what this component is and its key variants/capabilities. Then provide structured sections: PURPOSE: What this component is and its primary function. BEHAVIOR: Interactive behavior patterns (e.g., 'expanding one accordion panel collapses all others', 'dropdown closes on outside click'). Skip this section if the component is not interactive. COMPOSITION: List all nested/child component instances used (e.g., 'Contains Button, Icon, and Badge sub-components'). Note: AI code generators should check the development codebase for these sub-components before creating new ones. USAGE: When and how to use this component vs alternatives. CODE GENERATION NOTES: Implementation considerations — mention leveraging existing sub-components from the codebase, design patterns to follow, and interaction details not visible from design specs alone.",
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
  "recommendedProperties": [
    {
      "name": "Figma property name to add (e.g. 'Size', 'Icon Before')",
      "type": "VARIANT|BOOLEAN|TEXT|INSTANCE_SWAP",
      "description": "Why this property improves the component for design system usage and developer handoff",
      "examples": ["specific example values relevant to this component"]
    }
  ],
  "audit": {
    "tokenOpportunities": ["Specific recommendations for design token implementation in Figma"],
    "structureIssues": ["Component structure improvements for better design system integration"]
  },
  "mcpReadiness": {
    "score": "0-100 readiness score for MCP server code generation",
    "strengths": [
      "REQUIRED: List 2-3 specific DESIGN strengths this component already has for code generation",
      "FIGMA-ONLY Examples: 'Clear visual hierarchy in layers', 'Consistent spacing patterns', 'Well-organized component variants', 'Uses Figma variables for colors', 'Semantic layer naming', 'Defined visual states in Figma'"
    ],
    "gaps": [
      "REQUIRED: List 2-4 specific DESIGN gaps that limit MCP code generation effectiveness",
      "FIGMA-ONLY Examples: 'Missing visual states in Figma designs', 'Hard-coded spacing values (not using Figma variables)', 'Unclear component variant organization', 'Inconsistent layer naming conventions', 'No component properties defined in Figma', 'Missing visual feedback states'"
    ],
    "recommendations": [
      "REQUIRED: List 2-4 specific, actionable FIGMA DESIGN recommendations to improve MCP readiness",
      "FIGMA-ONLY Examples: 'Add hover and focus state designs in Figma', 'Replace hard-coded spacing with Figma variables', 'Define component variant properties in Figma', 'Standardize layer naming convention', 'Create missing visual states in component variants', 'Organize color styles into semantic tokens'"
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

**Recommended Properties Guidelines:**
For the "recommendedProperties" field, compare the component's EXISTING properties against best practices from established design systems (Material Design, Carbon, Ant Design, Polaris, Lightning, Spectrum, etc.):
- Only recommend Figma component properties that do NOT already exist on this component
- Use Figma property types: VARIANT (for enumerated options like size/style), BOOLEAN (for toggles like show/hide icon), TEXT (for editable text like labels), INSTANCE_SWAP (for swappable sub-components like icons)
- Each recommendation must be specific to THIS component type and its actual structure — do not suggest generic properties that don't apply
- If the component already has comprehensive properties, return an empty array — never force recommendations
- Consider what developers will need when consuming this component in code

**CRITICAL: AVOID ALL Development-Only Concerns:**
- Do NOT suggest implementing ARIA attributes, accessibility APIs, or semantic HTML (this is code-level)
- Do NOT suggest adding keyboard navigation, event handlers, or interactive behaviors (this is code-level)
- Do NOT suggest functional programming patterns, state management, or controlled/uncontrolled components (this is code-level)
- Do NOT suggest responsive breakpoint behaviors or CSS-specific implementations (this is code-level)
- Do NOT suggest animation tokens, transition timing, or programmatic animations (this is code-level)
- Do NOT suggest API integration, data binding, or dynamic content loading (this is code-level)
- ONLY focus on VISUAL DESIGN and DESIGN SYSTEM concerns that can be addressed within Figma

**Token Naming Convention:**
- Colors: \`semantic-[purpose]-[variant]\` (e.g., "semantic-color-primary", "neutral-background-subtle")
- Spacing: \`spacing-[size]-[value]\` (e.g., "spacing-md-16px", "spacing-lg-24px")
- Typography: \`text-[property]-[variant]-[value]\` (e.g., "text-size-lg-18px", "text-weight-semibold-600")
- Effects: \`[effect]-[intensity]-[purpose]\` (e.g., "shadow-md-default", "blur-backdrop-light")
- Borders: \`radius-[size]-[value]\` (e.g., "radius-md-8px", "radius-full-999px")

Focus on creating a comprehensive DESIGN analysis that helps designers build scalable, consistent, and well-structured Figma components.`;
}

/**
 * Extract JSON from Claude response with improved parsing
 */
export function extractJSONFromResponse(response: string): any {
  try {
    console.log('🔍 Starting JSON extraction from LLM response...');
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
    console.error('❌ Failed to parse JSON from LLM response:', error);
    console.log('📝 Full response for debugging:', response);
    throw new Error('Invalid JSON response from LLM API');
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

  // If we reach here, the JSON is likely truncated
  // Try to reconstruct a valid JSON by finding a reasonable truncation point
  console.log('⚠️ JSON appears to be truncated, attempting reconstruction...');
  return reconstructTruncatedJson(response, firstBrace);
}

/**
 * Attempt to reconstruct a valid JSON from a truncated response
 */
function reconstructTruncatedJson(response: string, startIndex: number): any | null {
  try {
    const jsonStr = response.substring(startIndex);

    // Find the last complete property before truncation
    const lines = jsonStr.split('\n');
    let reconstructed = '';
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Check if this line would make the JSON invalid
      for (let i = 0; i < line.length; i++) {
        const char = line[i];

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
          }
        }
      }

      // If this line seems incomplete or would break JSON, stop here
      if (inString || line.trim().endsWith(',') === false && lineIndex < lines.length - 1) {
        // This line might be incomplete, try without it
        break;
      }

      reconstructed += line + '\n';
    }

    // Close any open braces
    while (braceCount > 0) {
      reconstructed += '}\n';
      braceCount--;
    }

    // Try to parse the reconstructed JSON
    const parsed = JSON.parse(reconstructed.trim());
    console.log('✅ Successfully reconstructed truncated JSON');
    return parsed;

  } catch (error) {
    console.log('⚠️ Failed to reconstruct truncated JSON:', error instanceof Error ? error.message : 'Unknown error');

    // Last resort: try to extract just the basic component info
    return extractBasicComponentInfo(response);
  }
}

/**
 * Extract basic component information as a fallback for failed JSON parsing
 */
function extractBasicComponentInfo(response: string): any | null {
  try {
    console.log('🔄 Attempting to extract basic component info as fallback...');

    // Look for component name and description
    const componentMatch = response.match(/"component":\s*"([^"]+)"/);
    const descriptionMatch = response.match(/"description":\s*"([^"]+)"/);

    if (componentMatch && descriptionMatch) {
      const fallbackData = {
        component: componentMatch[1],
        description: descriptionMatch[1],
        props: [],
        states: ['default'],
        variants: {},
        tokens: { colors: [], spacing: [], typography: [] },
        audit: {
          tokenOpportunities: ['Review and simplify component analysis']
        },
        mcpReadiness: {
          score: 60,
          strengths: ['Component has basic structure'],
          gaps: ['Analysis was incomplete due to response size'],
          recommendations: ['Simplify component structure', 'Use MCP-enhanced analysis for better results']
        },
        propertyCheatSheet: []
      };

      console.log('✅ Extracted basic component info as fallback');
      return fallbackData;
    }

    return null;
  } catch (error) {
    console.log('⚠️ Failed to extract basic component info:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
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

/**
 * Filter out development-focused recommendations that shouldn't be in Figma analysis
 */
export function filterDevelopmentRecommendations(data: any): any {
  if (!data || typeof data !== 'object') return data;

  // Development-focused keywords to filter out
  const developmentKeywords = [
    'aria', 'accessibility api', 'semantic html',
    'keyboard navigation', 'event handler', 'interactive behavior', 'onclick', 'onchange',
    'state management', 'controlled component', 'uncontrolled component', 'props',
    'responsive breakpoint', 'css implementation', '@media',
    'animation token', 'transition timing', 'programmatic animation', 'keyframe',
    'api integration', 'data binding', 'dynamic content', 'fetch', 'axios',
    'implement', 'add handler', 'bind event', 'attach listener',
    'programming pattern', 'functional pattern', 'react hook', 'usestate', 'useeffect'
  ];

  // Function to check if a recommendation contains development keywords
  const isDevelopmentFocused = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    return developmentKeywords.some(keyword => lowerText.includes(keyword));
  };

  // Function to recursively filter arrays of recommendations
  const filterRecommendationArray = (arr: any[]): any[] => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter(item => {
      if (typeof item === 'string') {
        const filtered = !isDevelopmentFocused(item);
        if (!filtered) {
          console.log('🚫 [FILTER] Removed development-focused recommendation:', item);
        }
        return filtered;
      }
      return true;
    });
  };

  // Create a deep copy to avoid mutations
  const filteredData = JSON.parse(JSON.stringify(data));

  // Filter various recommendation arrays
  if (filteredData.mcpReadiness) {
    if (filteredData.mcpReadiness.recommendations) {
      filteredData.mcpReadiness.recommendations = filterRecommendationArray(filteredData.mcpReadiness.recommendations);
    }
    if (filteredData.mcpReadiness.gaps) {
      filteredData.mcpReadiness.gaps = filterRecommendationArray(filteredData.mcpReadiness.gaps);
    }
  }

  if (filteredData.audit) {
    if (filteredData.audit.tokenOpportunities) {
      filteredData.audit.tokenOpportunities = filterRecommendationArray(filteredData.audit.tokenOpportunities);
    }
    if (filteredData.audit.structureIssues) {
      filteredData.audit.structureIssues = filterRecommendationArray(filteredData.audit.structureIssues);
    }
  }

  // Filter accessibility recommendations to focus on design concerns only
  if (filteredData.accessibility) {
    if (filteredData.accessibility.designConsiderations) {
      filteredData.accessibility.designConsiderations = filterRecommendationArray(filteredData.accessibility.designConsiderations);
    }
    if (filteredData.accessibility.visualIndicators) {
      filteredData.accessibility.visualIndicators = filterRecommendationArray(filteredData.accessibility.visualIndicators);
    }
  }

  return filteredData;
}

