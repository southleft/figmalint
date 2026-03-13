import { Hono } from 'hono';
import { loadSession } from '../services/session.js';

const app = new Hono();

/**
 * GET /api/session/:id — retrieve full session data.
 */
app.get('/session/:id', (c) => {
  const id = c.req.param('id');
  const session = loadSession(id);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({
    id: session.id,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    nodeId: session.node_id,
    nodeName: session.node_name,
    pageType: session.page_type,
    scoreInitial: session.score_initial,
    scoreCurrent: session.score_current,
    lintResult: session.lint_result ? JSON.parse(session.lint_result) : null,
    aiReview: session.ai_review ? JSON.parse(session.ai_review) : null,
    referoData: session.refero_data ? JSON.parse(session.refero_data) : null,
    issuesFound: session.issues_found,
    issuesFixed: session.issues_fixed,
    issuesSkipped: session.issues_skipped,
    conversationLength: JSON.parse(session.conversation || '[]').length,
  });
});

/**
 * GET /api/session/:id/refero — check if async Refero data is ready.
 * Used by frontend to poll for quick-mode background Refero results.
 */
app.get('/session/:id/refero', (c) => {
  const id = c.req.param('id');
  const session = loadSession(id);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (!session.refero_data) {
    return c.json({ ready: false });
  }

  return c.json({
    ready: true,
    data: JSON.parse(session.refero_data),
  });
});

export default app;
