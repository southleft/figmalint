// Simple proxy server for AI Design Co-Pilot Figma Plugin
// This handles Claude API calls to bypass CORS restrictions

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (for development)
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'AI Design Co-Pilot Proxy Server is running' });
});

// Proxy endpoint for Claude API
app.post('/api/claude', async (req, res) => {
  try {
    const { apiKey, prompt } = req.body;

    if (!apiKey || !prompt) {
      return res.status(400).json({ error: 'Missing apiKey or prompt' });
    }

    // Make the actual Claude API call
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || 'Claude API error',
        details: data
      });
    }

    res.json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Proxy server error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI Design Co-Pilot proxy server running on port ${PORT}`);
  console.log(`Make requests to: http://localhost:${PORT}/api/claude`);
});

// Instructions:
// 1. Save this file as proxy-server.js
// 2. Run: npm init -y
// 3. Run: npm install express cors node-fetch
// 4. Run: node proxy-server.js
// 5. Update the plugin to use http://localhost:3000/api/claude
