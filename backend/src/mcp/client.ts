import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const REFERO_MCP_URL = process.env.REFERO_MCP_URL || 'https://refero.design/mcp';

let client: Client | null = null;
let connectionFailed = false;

/**
 * Get or create a persistent MCP client connected to Refero.
 * Returns null if connection fails (graceful degradation).
 */
export async function getReferoClient(): Promise<Client | null> {
  if (connectionFailed) return null;
  if (client) return client;

  try {
    const newClient = new Client({
      name: 'figmalint-design-review',
      version: '1.0.0',
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(REFERO_MCP_URL),
    );

    await newClient.connect(transport);
    client = newClient;
    console.log('Connected to Refero MCP server');
    return client;
  } catch (error) {
    console.warn('Failed to connect to Refero MCP:', error instanceof Error ? error.message : error);
    connectionFailed = true;
    // Auto-retry after 5 minutes
    setTimeout(() => { connectionFailed = false; }, 5 * 60 * 1000);
    return null;
  }
}

/**
 * Check if Refero MCP is available.
 */
export function isReferoAvailable(): boolean {
  return client !== null && !connectionFailed;
}

/**
 * Disconnect the MCP client.
 */
export async function disconnectRefero(): Promise<void> {
  if (client) {
    try {
      await client.close();
    } catch { /* ignore */ }
    client = null;
  }
}
