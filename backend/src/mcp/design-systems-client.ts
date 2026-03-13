import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DESIGN_SYSTEMS_MCP_URL =
  process.env.DESIGN_SYSTEMS_MCP_URL || 'https://design-systems-mcp.southleft.com/mcp';

let client: Client | null = null;
let connectionFailed = false;

/**
 * Get or create a persistent MCP client connected to the Design Systems server.
 * Returns null if connection fails (graceful degradation).
 */
export async function getDesignSystemsClient(): Promise<Client | null> {
  if (connectionFailed) return null;
  if (client) return client;

  try {
    const newClient = new Client({
      name: 'figmalint-design-review',
      version: '1.0.0',
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(DESIGN_SYSTEMS_MCP_URL),
    );

    await newClient.connect(transport);
    client = newClient;
    console.log('Connected to Design Systems MCP server');
    return client;
  } catch (error) {
    console.warn(
      'Failed to connect to Design Systems MCP:',
      error instanceof Error ? error.message : error,
    );
    connectionFailed = true;
    // Auto-retry after 5 minutes
    setTimeout(() => { connectionFailed = false; }, 5 * 60 * 1000);
    return null;
  }
}

export function isDesignSystemsAvailable(): boolean {
  return client !== null && !connectionFailed;
}

export async function disconnectDesignSystems(): Promise<void> {
  if (client) {
    try { await client.close(); } catch { /* ignore */ }
    client = null;
  }
}
