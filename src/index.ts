#!/usr/bin/env node

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables first - before any other imports that might use them
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, validateToken } from './config.js';
import {
    GetSettingArgs,
    handleGetCompanySetting,
    handleListCompanySettings,
    handleSearchInSetting,
    handleVerifyTokens,
    ListSettingsArgs,
    SearchInSettingArgs,
} from './handlers.js';
import tools from './toolSchemas.js';

const server = new Server(
  { name: 'transporeon-company-settings', version: '1.0.0' },
  { capabilities: { resources: {}, tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: 'info://status', name: 'Server Status', description: 'Current server status', mimeType: 'text/plain' },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === 'info://status') {
    return {
      contents: [
        { uri: 'info://status', mimeType: 'text/plain', text: 'Transporeon Company Settings MCP server is running.' },
      ],
    };
  }
  throw new Error('Resource not found');
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const toToolReturn = (payload: any) => ({
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      isError: payload && payload.success === false,
    });
    const getArgs = <T>(a: unknown): T => a as unknown as T;
    
    switch (name) {
      case 'list_company_settings':
        return toToolReturn(await handleListCompanySettings(getArgs<ListSettingsArgs>(args)));
      case 'get_company_setting':
        return toToolReturn(await handleGetCompanySetting(getArgs<GetSettingArgs>(args)));
      case 'search_in_setting':
        return toToolReturn(await handleSearchInSetting(getArgs<SearchInSettingArgs>(args)));
      case 'verify_environment_tokens':
        return toToolReturn(await handleVerifyTokens());
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }, null, 2) }], isError: true };
  }
});

async function main() {
  try {
    // Load and validate configuration
    console.error('Loading configuration...');
    const config = loadConfig();
    console.error(`Configuration loaded successfully. Environment: ${config.defaultEnvironment}`);

    // Validate token
    console.error('Validating API token...');
    const isTokenValid = await validateToken(config);
    if (!isTokenValid) {
      console.error('❌ Token validation failed. Please check your token configuration:');
      console.error('  - Environment-specific tokens: TP_SETTINGS_TOKEN_PD, TP_SETTINGS_TOKEN_IN, TP_SETTINGS_TOKEN_AC');
      console.error('  - Or single token (legacy): TP_SETTINGS_TOKEN');
      process.exit(1);
    }
    console.error('✅ Token validation successful.');

    // Start server
    const args = process.argv.slice(2);
    const transport = args.includes('--transport') && args[args.indexOf('--transport') + 1];

    if (transport === 'streamable-http') {
      console.error('HTTP transport not yet implemented. Please use stdio transport.');
      process.exit(1);
    } else {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('🚀 Transporeon Company Settings MCP Server running on stdio transport');
    }
  } catch (error) {
    console.error('❌ Failed to start MCP server:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\nPlease check:');
    console.error('1. Your token configuration:');
    console.error('   - Environment-specific: TP_SETTINGS_TOKEN_PD, TP_SETTINGS_TOKEN_IN, TP_SETTINGS_TOKEN_AC');
    console.error('   - Or single token (legacy): TP_SETTINGS_TOKEN');
    console.error('2. You have VPN access to Transporeon network');
    console.error('3. Your tokens are valid and have appropriate permissions');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
