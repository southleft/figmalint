import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import health from './routes/health.js';
import analyze from './routes/analyze.js';
import chat from './routes/chat.js';
import stream from './routes/stream.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

// Ensure data directory exists for SQLite
const dbPath = process.env.DATABASE_PATH || './data/sessions.db';
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    // Figma plugin iframes send origin: null; also allow the plugin's backend domain
    origin: (origin) => {
      if (!origin || origin === 'null') return 'null'; // Figma sandboxed iframe
      const allowed = ['https://api.figmalint.labpics.com', 'http://localhost:3000'];
      return allowed.includes(origin) ? origin : 'null';
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
);

// Routes
app.route('/api', health);
app.route('/api', analyze);
app.route('/api', chat);
app.route('/api', stream);

// Root
app.get('/', (c) => c.json({ name: 'FigmaLint Design Review API', version: '1.0.0' }));

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`Starting FigmaLint backend on port ${port}...`);
serve({ fetch: app.fetch, port });
console.log(`Server running at http://localhost:${port}`);
