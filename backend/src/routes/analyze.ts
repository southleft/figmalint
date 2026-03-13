import { Hono } from 'hono';
import { runAnalysis, type AnalyzeRequest } from '../services/analyzer.js';

const app = new Hono();

app.post('/analyze', async (c) => {
  try {
    let body: AnalyzeRequest;
    try {
      body = await c.req.json<AnalyzeRequest>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Request body must be a JSON object' }, 400);
    }
    if (!body.screenshot || typeof body.screenshot !== 'string') {
      return c.json({ error: 'screenshot is required and must be a string' }, 400);
    }
    if (!body.lintResult || typeof body.lintResult !== 'object') {
      return c.json({ error: 'lintResult is required' }, 400);
    }
    if (!body.extractedData || typeof body.extractedData !== 'object') {
      return c.json({ error: 'extractedData is required' }, 400);
    }
    if (!body.extractedData.componentName || typeof body.extractedData.componentName !== 'string') {
      return c.json({ error: 'extractedData.componentName is required' }, 400);
    }

    const result = await runAnalysis(body);
    return c.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    const message = error instanceof Error ? error.message : 'Analysis failed';
    const status = message.includes('Session not found') ? 404 : 500;
    return c.json({ error: message }, status);
  }
});

export default app;
