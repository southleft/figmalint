export function buildReviewPrompt(lintSummary: string, componentInfo: string): string {
  return `You are a senior product designer. Analyze this UI component screenshot.

Context:
${componentInfo}

Lint results:
${lintSummary}

Tasks:
1. Assess visual hierarchy — is there a clear focal point? Are heading sizes distinct from body?
2. Assess spacing and rhythm — does spacing follow a 4px or 8px grid? Are gaps consistent?
3. Assess color harmony — are colors working together? Is there sufficient contrast?
4. Assess accessibility — check text contrast against backgrounds, touch target sizing (≥44px), text readability (≥12px font size), and proper labeling of interactive elements.
5. Assess component state coverage — are hover, focus, disabled, and error states present or implied? Flag any missing states.
6. Assess platform alignment — detect whether the design follows iOS (HIG), Android (Material Design 3), or web conventions. Note deviations from the detected platform's guidelines.
7. Give 3-5 specific, actionable recommendations prioritized by user impact.

Respond in this exact JSON format:
{
  "visualHierarchy": { "score": <1-10>, "notes": "<observation>" },
  "spacingRhythm": { "score": <1-10>, "notes": "<observation about grid adherence>" },
  "colorHarmony": { "score": <1-10>, "notes": "<observation>" },
  "accessibility": { "score": <1-10>, "notes": "<contrast, targets, text size observations>" },
  "statesCoverage": { "score": <1-10>, "notes": "<which states are present/missing>", "missing": ["<state1>", "<state2>"] },
  "platformAlignment": { "detected": "<ios|android|web>", "score": <1-10>, "notes": "<platform guideline adherence>" },
  "missingStates": ["<state1>", "<state2>"],
  "recommendations": [
    { "title": "<short title>", "description": "<specific action>", "severity": "critical|warning|info" }
  ],
  "overallScore": <1-100>,
  "summary": "<2-3 sentence summary>"
}`;
}
