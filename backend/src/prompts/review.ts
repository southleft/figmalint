export function buildReviewPrompt(lintSummary: string, componentInfo: string): string {
  return `You are a senior product designer. Analyze this UI component screenshot.

Context:
${componentInfo}

Lint results:
${lintSummary}

Tasks:
1. Assess visual hierarchy — is there a clear focal point?
2. Assess spacing and rhythm — is the grid consistent or irregular?
3. Assess color harmony — are colors working together?
4. Identify missing interactive states
5. Give 3-5 specific, actionable recommendations

Respond in this exact JSON format:
{
  "visualHierarchy": { "score": <1-10>, "notes": "<observation>" },
  "spacingRhythm": { "score": <1-10>, "notes": "<observation>" },
  "colorHarmony": { "score": <1-10>, "notes": "<observation>" },
  "missingStates": ["<state1>", "<state2>"],
  "recommendations": [
    { "title": "<short title>", "description": "<specific action>", "severity": "critical|warning|info" }
  ],
  "overallScore": <1-100>,
  "summary": "<2-3 sentence summary>"
}`;
}
