#!/usr/bin/env node

/**
 * Test script for MCP server connectivity
 * This helps diagnose connection issues before integrating with the Figma plugin
 */

const MCP_SERVER_URL = 'https://design-systems-mcp.southleft-llc.workers.dev/mcp';

console.log('🔍 Testing MCP Server Connectivity');
console.log('=====================================');
console.log(`Server URL: ${MCP_SERVER_URL}`);
console.log('');

async function testHealthEndpoint() {
  console.log('1️⃣ Testing Health Endpoint...');

  try {
    const healthUrl = MCP_SERVER_URL.replace('/mcp', '') + '/health';
    console.log(`   GET ${healthUrl}`);

    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.text();
      console.log(`   Response: ${data}`);
      console.log('   ✅ Health check successful');
    } else {
      console.log('   ❌ Health check failed');
    }
  } catch (error) {
    console.log(`   ❌ Health check error: ${error.message}`);
  }

  console.log('');
}

async function testMCPEndpoint() {
  console.log('2️⃣ Testing MCP Endpoint...');

  try {
    console.log(`   POST ${MCP_SERVER_URL}`);

    // Test basic MCP initialization
    const initPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {
          roots: { listChanged: true }
        },
        clientInfo: {
          name: "figmalint-test",
          version: "1.0.0"
        }
      }
    };

    console.log(`   Payload:`, JSON.stringify(initPayload, null, 2));

    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(initPayload)
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      console.log(`   Response:`, JSON.stringify(data, null, 2));
      console.log('   ✅ MCP initialization successful');
      return true;
    } else {
      const errorText = await response.text();
      console.log(`   Error Response: ${errorText}`);
      console.log('   ❌ MCP initialization failed');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ MCP endpoint error: ${error.message}`);
    return false;
  }

  console.log('');
}

async function testMCPTools() {
  console.log('3️⃣ Testing MCP Tools...');

  try {
    // Test listing available tools
    const toolsPayload = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    };

    console.log(`   Listing available tools...`);

    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(toolsPayload)
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   Available tools:`, data.result?.tools?.map(t => t.name) || 'None');
      console.log('   ✅ Tools list successful');
      return true;
    } else {
      const errorText = await response.text();
      console.log(`   Error: ${errorText}`);
      console.log('   ❌ Tools list failed');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Tools error: ${error.message}`);
    return false;
  }

  console.log('');
}

async function testSearchTool() {
  console.log('4️⃣ Testing Search Tool...');

  try {
    // Test the search_design_knowledge tool
    const searchPayload = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "search_design_knowledge",
        arguments: {
          query: "design tokens",
          limit: 3
        }
      }
    };

    console.log(`   Testing search for "design tokens"...`);

    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(searchPayload)
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   Search results: ${data.result?.content?.length || 0} entries found`);
      if (data.result?.content?.length > 0) {
        console.log(`   First result: ${data.result.content[0].title || 'No title'}`);
      }
      console.log('   ✅ Search successful');
      return true;
    } else {
      const errorText = await response.text();
      console.log(`   Error: ${errorText}`);
      console.log('   ❌ Search failed');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Search error: ${error.message}`);
    return false;
  }

  console.log('');
}

async function testCORSHeaders() {
  console.log('5️⃣ Testing CORS Headers...');

  try {
    // Test OPTIONS request (preflight)
    console.log(`   Testing CORS preflight (OPTIONS request)...`);

    const response = await fetch(MCP_SERVER_URL, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://www.figma.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   CORS Headers:`);

    const corsHeaders = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase().includes('access-control')) {
        corsHeaders[key] = value;
        console.log(`     ${key}: ${value}`);
      }
    });

    const allowsContentType = corsHeaders['access-control-allow-headers']?.includes('content-type');
    console.log(`   Content-Type allowed: ${allowsContentType ? '✅ Yes' : '❌ No'}`);

    return allowsContentType;
  } catch (error) {
    console.log(`   ❌ CORS test error: ${error.message}`);
    return false;
  }

  console.log('');
}

async function runAllTests() {
  console.log('Starting MCP Server Tests...\n');

  const results = {
    health: false,
    mcp: false,
    tools: false,
    search: false,
    cors: false
  };

  results.health = await testHealthEndpoint();
  results.mcp = await testMCPEndpoint();

  if (results.mcp) {
    results.tools = await testMCPTools();
    if (results.tools) {
      results.search = await testSearchTool();
    }
  }

  results.cors = await testCORSHeaders();

  // Summary
  console.log('📋 Test Results Summary');
  console.log('========================');
  console.log(`Health Endpoint:  ${results.health ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MCP Initialization: ${results.mcp ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MCP Tools:        ${results.tools ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Search Function:  ${results.search ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`CORS Headers:     ${results.cors ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  // Recommendations
  console.log('🎯 Recommendations');
  console.log('===================');

  if (!results.cors) {
    console.log('❗ CORS Issue Detected:');
    console.log('   The MCP server needs to allow "content-type" in Access-Control-Allow-Headers');
    console.log('   This is blocking Figma plugin requests');
    console.log('');
  }

  if (!results.health) {
    console.log('❗ Health endpoint not accessible');
    console.log('   Consider using a different connectivity test');
    console.log('');
  }

  if (results.mcp && results.tools && results.search) {
    console.log('✅ MCP server is functional for API calls');
    console.log('   The server can handle MCP requests when CORS is resolved');
    console.log('');
  }

  const overallSuccess = results.mcp && results.search;
  console.log(`Overall Status: ${overallSuccess ? '✅ Server Ready (CORS fix needed)' : '❌ Server Issues'}`);
}

// Run the tests
runAllTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
