import { Hono } from 'hono';
import { streamChat } from '../services/claude.js';
import { addMessage, getConversation, getSessionContext, loadSession } from '../services/session.js';
import { buildFollowupPrompt } from '../prompts/chat-followup.js';

const app = new Hono();

app.post('/chat', async (c) => {
  try {
    let body: { sessionId: string; message: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.sessionId || typeof body.sessionId !== 'string') {
      return c.json({ error: 'sessionId is required' }, 400);
    }
    if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
      return c.json({ error: 'message is required and must be a non-empty string' }, 400);
    }

    const session = loadSession(body.sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Save user message
    addMessage(body.sessionId, 'user', body.message);

    // Get conversation history and build context
    const history = getConversation(body.sessionId);
    const sessionContext = getSessionContext(body.sessionId);
    // buildFollowupPrompt already embeds session context;
    // pass only history as messages to avoid duplication
    const systemPrompt = buildFollowupPrompt(sessionContext, history);

    // Build messages for API — only include recent history to avoid context bloat
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Stream response
    const chunks: string[] = [];
    for await (const chunk of streamChat(systemPrompt, messages)) {
      chunks.push(chunk);
    }

    const response = chunks.join('');

    // Save assistant response
    addMessage(body.sessionId, 'assistant', response);

    return c.json({ message: response, sessionId: body.sessionId });
  } catch (error) {
    console.error('Chat error:', error);
    const message = error instanceof Error ? error.message : 'Chat failed';
    return c.json({ error: message }, 500);
  }
});

export default app;
