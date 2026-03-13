import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { streamChat } from '../services/claude.js';
import { addMessage, getConversation, getSessionContext, loadSession } from '../services/session.js';
import { buildFollowupPrompt } from '../prompts/chat-followup.js';

const app = new Hono();

/**
 * SSE endpoint for streaming chat responses.
 * POST /api/stream/:sessionId
 * Body: { message: string }
 */
app.post('/stream/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  let body: { message: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    return c.json({ error: 'message is required and must be a non-empty string' }, 400);
  }

  const session = loadSession(sessionId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Save user message
  addMessage(sessionId, 'user', body.message);

  const history = getConversation(sessionId);
  const sessionContext = getSessionContext(sessionId);
  const systemPrompt = buildFollowupPrompt(sessionContext, history);

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = history.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  return streamSSE(c, async (stream) => {
    const chunks: string[] = [];

    try {
      for await (const chunk of streamChat(systemPrompt, messages)) {
        chunks.push(chunk);
        await stream.writeSSE({
          event: 'chunk',
          data: JSON.stringify({ text: chunk }),
        });
      }

      const fullResponse = chunks.join('');
      addMessage(sessionId, 'assistant', fullResponse);

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ sessionId }),
      });
    } catch (error) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: error instanceof Error ? error.message : 'Stream failed' }),
      });
    }
  });
});

export default app;
