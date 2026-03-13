export function buildReviewPrompt(lintSummary: string, componentInfo: string): string {
  return `Analyze this UI component screenshot. Do NOT evaluate spacing or accessibility — those are already covered by automated lint.

Context:
${componentInfo}

Lint results (for reference only — do not re-evaluate these):
${lintSummary}

Evaluate ONLY these 4 categories using the rubric below. Each category must have a rating (pass/needs_improvement/fail), 2-3 specific evidence items from the screenshot, and a recommendation (null if pass).

## Category 1: Visual Hierarchy
PASS: Clear focal point, heading sizes distinctly larger than body (≥1.25x ratio), logical reading flow (F-pattern or Z-pattern)
NEEDS_IMPROVEMENT: Focal point exists but competing elements distract; heading/body ratio < 1.25x; reading flow unclear in some areas
FAIL: No clear focal point; headings and body text same visual weight; no logical reading flow

## Category 2: States Coverage
PASS: All relevant states present (hover, focus, disabled, error for interactive elements; loading for async operations)
NEEDS_IMPROVEMENT: Some states present but 1-2 critical states missing (e.g., focus or error)
FAIL: Only default state shown; no hover, focus, disabled, or error states
List specific missing states in the "missingStates" array.

## Category 3: Platform Alignment
PASS: Design follows detected platform conventions (iOS HIG / Material Design 3 / Web) consistently — navigation, typography, iconography, and interaction patterns match
NEEDS_IMPROVEMENT: Generally follows platform conventions but 1-2 elements deviate (e.g., iOS back arrow on Android, mixed icon styles)
FAIL: Significant platform violations — mixed conventions from multiple platforms, non-standard navigation patterns

## Category 4: Color Harmony
PASS: Colors form a cohesive palette (complementary, analogous, or monochromatic scheme); accent colors used purposefully for CTAs and status
NEEDS_IMPROVEMENT: Palette mostly cohesive but 1-2 colors feel disconnected; accent usage inconsistent
FAIL: No discernible color scheme; colors clash; accent colors used arbitrarily

Respond in this exact JSON format:
{
  "visualHierarchy": {
    "rating": "pass|needs_improvement|fail",
    "evidence": ["<observation 1>", "<observation 2>"],
    "recommendation": "<actionable suggestion or null if pass>"
  },
  "statesCoverage": {
    "rating": "pass|needs_improvement|fail",
    "evidence": ["<observation 1>", "<observation 2>"],
    "missingStates": ["<state1>", "<state2>"],
    "recommendation": "<actionable suggestion or null if pass>"
  },
  "platformAlignment": {
    "rating": "pass|needs_improvement|fail",
    "detectedPlatform": "ios|android|web",
    "evidence": ["<observation 1>", "<observation 2>"],
    "recommendation": "<actionable suggestion or null if pass>"
  },
  "colorHarmony": {
    "rating": "pass|needs_improvement|fail",
    "evidence": ["<observation 1>", "<observation 2>"],
    "recommendation": "<actionable suggestion or null if pass>"
  },
  "recommendations": [
    { "title": "<short title>", "description": "<specific action>", "severity": "critical|warning|info" }
  ],
  "summary": "<2-3 sentence summary>"
}`;
}
