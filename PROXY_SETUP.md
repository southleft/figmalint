# Proxy Server Setup for AI Design Co-Pilot

Due to CORS restrictions in Figma plugins, you need to run a local proxy server to connect to the Claude API.

## Quick Start

1. **Open a new terminal window** (keep it separate from your main development terminal)

2. **Navigate to the plugin directory**:
   ```bash
   cd /path/to/ai-design-co-pilot
   ```

3. **Install proxy dependencies**:
   ```bash
   npm install express cors node-fetch
   ```

4. **Start the proxy server**:
   ```bash
   node proxy-server.js
   ```

   You should see:
   ```
   AI Design Co-Pilot proxy server running on port 3000
   Make requests to: http://localhost:3000/api/claude
   ```

5. **Keep the proxy running** while using the Figma plugin

## How It Works

```
Figma Plugin → Proxy Server (localhost:3000) → Claude API
             ←                               ←
```

The proxy server:
- Accepts requests from the Figma plugin (no CORS restrictions)
- Forwards them to Claude API with proper authentication
- Returns the response back to the plugin

## Troubleshooting

### "Failed to fetch" error
- Make sure the proxy server is running
- Check that port 3000 is not in use by another application
- Try restarting the proxy server

### "Connection refused" error
- The proxy server is not running
- Run `node proxy-server.js` in a terminal

### API key errors
- Ensure your Claude API key starts with `sk-ant-`
- Check that your API key has proper permissions

## Production Deployment

For production use, you should:
1. Deploy the proxy server to a cloud service (Vercel, Heroku, etc.)
2. Update the PROXY_URL in code.ts to your deployed URL
3. Add proper security measures (rate limiting, API key validation)

## Alternative: Mock Mode

If you can't run the proxy server, the plugin will show a placeholder analysis that demonstrates the UI functionality without real API calls.
