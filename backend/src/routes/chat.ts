import { Hono } from 'hono';
import { streamChat } from '../services/claude.js';
import { addMessage, getConversation, getSessionContext, loadSession } from '../services/session.js';
import { buildFollowupPrompt } from '../prompts/chat-followup.js';
import { SYSTEM_PROMPT } from '../prompts/system.js';

const app = new Hono();

app.post('/chat', async (c) => {
  try {
    const body = await c.req.json<{
      sessionId: string;
      message: string;
    }>();

    if (!body.sessionId || !body.message) {
      return c.json({ error: 'sessionId and message are required' }, 400);
    }

    const session = loadSession(body.sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Save user message
    addMessage(body.sessionId, 'user', body.message);

    // Get conversation history
    const history = getConversation(body.sessionId);
    const sessionContext = getSessionContext(body.sessionId);
    const systemPrompt = buildFollowupPrompt(sessionContext, history);

    // Build messages for API
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
