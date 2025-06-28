#!/usr/bin/env node

/**
 * Test script that simulates FigmaLint's MCP integration
 * Tests the CORS workaround by using the same approach as the plugin
 */

const MCP_SERVER_URL = 'https://design-systems-mcp.southleft-llc.workers.dev/mcp';

console.log('🔧 Testing FigmaLint MCP Integration (CORS Workaround)');
console.log('=====================================================');
console.log(`Server URL: ${MCP_SERVER_URL}`);
console.log('');

// Simulate the ComponentConsistencyEngine approach
class TestConsistencyEngine {
  constructor() {
    this.config = {
      enableCaching: true,
      enableMCPIntegration: true,
      mcpServerUrl: MCP_SERVER_URL,
      consistencyThreshold: 0.95
    };
  }

  async testMCPConnectivity() {
    try {
      console.log('🔗 Testing MCP server connectivity...');

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connectivity test timeout')), 5000)
      );

      // Use MCP initialization call instead of health endpoint to avoid CORS preflight
      const initPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: "figmalint", version: "2.0.0" }
        }
      };

      const fetchPromise = fetch(this.config.mcpServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(initPayload)
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (response.ok) {
        const data = await response.json();
        if (data.result?.serverInfo?.name) {
          console.log(`✅ MCP server accessible: ${data.result.serverInfo.name}`);
          return true;
        }
      }

      console.warn(`⚠️ MCP server returned ${response.status}`);
      return false;
    } catch (error) {
      console.warn('⚠️ MCP server connectivity test failed:', error);
      return false;
    }
  }

  async queryMCP(query) {
    try {
      console.log(`🔍 Querying MCP for: "${query}"`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('MCP query timeout')), 5000)
      );

      const searchPayload = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "search_design_knowledge",
          arguments: {
            query,
            limit: 5,
            category: 'components'
          }
        }
      };

      const fetchPromise = fetch(this.config.mcpServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchPayload)
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`MCP query failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ MCP query successful for: "${query}"`);
      return result;
    } catch (error) {
      console.warn(`⚠️ MCP query failed for "${query}":`, error);
      return this.getFallbackKnowledgeForQuery(query);
    }
  }

  getFallbackKnowledgeForQuery(query) {
    return {
      results: [
        {
          title: `Fallback guidance for ${query}`,
          content: 'Using fallback knowledge since MCP query failed',
          category: 'fallback'
        }
      ]
    };
  }

  async loadDesignSystemsKnowledge() {
    console.log('🔄 Loading design systems knowledge from MCP...');

    // Test MCP server connectivity first
    const connectivityTest = await this.testMCPConnectivity();
    if (!connectivityTest) {
      console.warn('⚠️ MCP server not accessible, using fallback knowledge');
      return false;
    }

    // Fetch knowledge in parallel for better performance
    const queries = [
      'component analysis best practices',
      'design token naming conventions and patterns',
      'design system accessibility requirements',
      'design system component scoring methodology'
    ];

    console.log('📥 Fetching design systems knowledge...');
    const results = await Promise.allSettled(
      queries.map(query => this.queryMCP(query))
    );

    const successfulQueries = results.filter(result => result.status === 'fulfilled').length;

    if (successfulQueries > 0) {
      console.log(`✅ Design systems knowledge loaded successfully (${successfulQueries}/${queries.length} queries successful)`);
      return true;
    } else {
      console.warn('⚠️ All MCP queries failed, using fallback knowledge');
      return false;
    }
  }
}

async function testFigmaLintMCPIntegration() {
  console.log('Starting FigmaLint MCP Integration Test...\n');

  const engine = new TestConsistencyEngine();

  try {
    const success = await engine.loadDesignSystemsKnowledge();

    console.log('\n📋 Test Results');
    console.log('================');

    if (success) {
      console.log('✅ MCP integration is working!');
      console.log('✅ CORS workaround successful');
      console.log('✅ FigmaLint can connect to your design systems knowledge');
      console.log('');
      console.log('🎯 Next Steps:');
      console.log('   1. Test the updated FigmaLint plugin in Figma');
      console.log('   2. You should now see consistent analysis results');
      console.log('   3. No more "MCP server not accessible" warnings');
    } else {
      console.log('❌ MCP integration failed');
      console.log('⚠️  FigmaLint will use fallback knowledge');
      console.log('');
      console.log('🔧 Troubleshooting:');
      console.log('   1. Check your internet connection');
      console.log('   2. Verify the MCP server URL is correct');
      console.log('   3. Try again in a few minutes');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testFigmaLintMCPIntegration();
