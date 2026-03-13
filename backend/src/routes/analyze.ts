import { Hono } from 'hono';
import { runAnalysis, type AnalyzeRequest } from '../services/analyzer.js';

const app = new Hono();

app.post('/analyze', async (c) => {
  try {
    const body = await c.req.json<AnalyzeRequest>();

    if (!body.screenshot) {
      return c.json({ error: 'screenshot is required' }, 400);
    }
    if (!body.lintResult) {
      return c.json({ error: 'lintResult is required' }, 400);
    }
    if (!body.extractedData) {
      return c.json({ error: 'extractedData is required' }, 400);
    }

    const result = await runAnalysis(body);
    return c.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return c.json({ error: message }, 500);
  }
});

export default app;
