/// <reference types="@figma/plugin-typings" />

import { ClaudeAPIRequest, ClaudeAPIResponse, ComponentContext } from '../types';

// Claude API Configuration
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-3-sonnet-20240229';
const MAX_TOKENS = 2048;

/**
 * Send a prompt to Claude API and get a response
 */
export async function fetchClaude(prompt: string, apiKey: string, model: string = DEFAULT_MODEL): Promise<string> {
  console.log('Making Claude API call directly...');

  // Prepare the request payload for Anthropic API
  const requestBody: ClaudeAPIRequest = {
    model,
    messages: [
      {
        role: 'user',
        content: prompt.trim()
      }
    ],
    max_tokens: MAX_TOKENS
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

**Analysis Requirements:**

1. **Component Metadata**: Provide comprehensive component documentation
2. **Design Token Analysis**: Analyze and recommend semantic design tokens
3. **Accessibility Assessment**: Evaluate accessibility compliance
4. **Naming Convention Review**: Check layer naming consistency
5. **Design System Integration**: Suggest improvements for scalability
6. **MCP Server Compatibility**: Ensure component structure supports automated code generation

**MCP Server Integration Focus:**
- **Property Definitions**: Components need clearly defined props that map to code
- **State Management**: Interactive components require all necessary states (hover, focus, disabled, etc.)
- **Token Usage**: Hard-coded values should use design tokens for consistency
- **Semantic Structure**: Layer names should be descriptive and follow conventions
- **Variant Patterns**: Only recommend variants when they serve a logical purpose (size, style, or functional differences)
- **Developer Handoff**: Metadata should include implementation guidance

**Important: Variant Recommendations Guidelines:**
- Do NOT recommend variants for components that are intentionally single-purpose (icons, badges, simple dividers)
- Only suggest variants when there's clear evidence the component should have multiple visual or functional states
- Consider the component family: buttons typically need variants, simple graphics usually don't
- Base variant suggestions on actual design system patterns, not theoretical possibilities

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
  "states": ["IMPORTANT: Use the Additional Context section above to determine appropriate states. For avatars marked as interactive, include hover/focus states. Only list states that make sense based on the component's use case and interactivity"],
  "slots": ["slot descriptions for content areas"],
  "variants": {
    "size": ["small", "medium", "large"],
    "variant": ["primary", "secondary", "outline"],
    "theme": ["light", "dark"]
  },
  "usage": "When and how to use this component",
  "accessibility": {
    "ariaLabels": ["required aria labels"],
    "keyboardSupport": "keyboard interaction requirements",
    "colorContrast": "contrast compliance status",
    "focusManagement": "focus behavior description"
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
    "accessibilityIssues": ["List specific accessibility issues found"],
    "namingIssues": ["List layer naming problems with suggestions"],
    "consistencyIssues": ["List design consistency issues"],
    "tokenOpportunities": ["Specific recommendations for design token implementation"]
  },
  "mcpReadiness": {
    "score": "0-100 readiness score for MCP server code generation",
    "strengths": ["What's already well-structured for code generation"],
    "gaps": ["What needs to be improved for MCP compatibility"],
    "recommendations": [
      "Specific actions to make this component MCP-ready",
      "Priority improvements for code generation accuracy"
    ],
    "implementationNotes": "Developer guidance for implementing this component"
  }
}

**Analysis Guidelines:**

1. **Be Specific**: Provide actionable, specific recommendations
2. **Modern Practices**: Follow current design system best practices
3. **Semantic Naming**: Use semantic token names that describe purpose, not appearance
4. **Scalability**: Consider how tokens support design system growth
5. **Accessibility**: Ensure recommendations support inclusive design
6. **Consistency**: Identify patterns that can be systematized

**Token Naming Convention:**
- Colors: \`semantic-[purpose]-[variant]\` (e.g., "semantic-color-primary", "neutral-background-subtle")
- Spacing: \`spacing-[size]-[value]\` (e.g., "spacing-md-16px", "spacing-lg-24px")
- Typography: \`text-[property]-[variant]-[value]\` (e.g., "text-size-lg-18px", "text-weight-semibold-600")
- Effects: \`[effect]-[intensity]-[purpose]\` (e.g., "shadow-md-default", "blur-backdrop-light")
- Borders: \`radius-[size]-[value]\` (e.g., "radius-md-8px", "radius-full-999px")

Focus on creating a comprehensive analysis that helps designers build scalable, consistent, and accessible design systems.`;
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
 * Extract JSON from Claude response
 */
export function extractJSONFromResponse(response: string): any {
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (error) {
    console.error('Failed to parse JSON from Claude response:', error);
    throw new Error('Invalid JSON response from Claude API');
  }
}
