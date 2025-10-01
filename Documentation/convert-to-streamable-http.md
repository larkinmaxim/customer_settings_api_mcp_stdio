# Converting MCP Server from STDIO to Streamable HTTP Transport

## 📋 Overview

This guide provides step-by-step instructions to convert the **Transporeon Company Settings MCP Server** from the current STDIO transport to **Streamable HTTP transport**, enabling web-based clients and HTTP API access.

## 🎯 Current vs Target Architecture

### Current Architecture (STDIO)
```
Client ↔ STDIN/STDOUT ↔ MCP Server ↔ Transporeon API
```

### Target Architecture (Streamable HTTP)
```
Web Browser/HTTP Client ↔ HTTP/SSE ↔ Express Server ↔ MCP Server ↔ Transporeon API
```

## 📁 Current Code Structure Analysis

```
src/
├── index.ts            # Entry point with STDIO transport
├── handlers.ts         # Tool handlers (NO CHANGES NEEDED)
├── settingsClient.ts   # API client (NO CHANGES NEEDED)
├── config.ts          # Configuration (NO CHANGES NEEDED)
├── toolSchemas.ts     # Tool definitions (NO CHANGES NEEDED)
├── types.ts           # Type definitions (NO CHANGES NEEDED)
└── constants.ts       # Constants (NO CHANGES NEEDED)
```

**✅ Only `index.ts` needs modification - all business logic remains unchanged!**

---

## 🚀 Implementation Steps

### Step 1: Update Dependencies

#### 1.1 Add New Dependencies to `package.json`

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "xml2js": "^0.6.2",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.16",
    "@types/xml2js": "^0.4.14",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```

#### 1.2 Install Dependencies

```bash
npm install express cors @types/express @types/cors
```

### Step 2: Create New HTTP Transport Implementation

#### 2.1 Create `src/httpServer.ts` (New File)

```typescript
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
  CallToolRequestSchema, 
  ListResourcesRequestSchema, 
  ListToolsRequestSchema, 
  ReadResourceRequestSchema,
  isInitializeRequest 
} from '@modelcontextprotocol/sdk/types.js';
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

export interface HttpServerOptions {
  port?: number;
  host?: string;
  stateful?: boolean;
  enableCors?: boolean;
  corsOrigin?: string | string[];
}

export class HttpMcpServer {
  private app: express.Application;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  private config: any;
  private options: HttpServerOptions;

  constructor(options: HttpServerOptions = {}) {
    this.options = {
      port: 3000,
      host: 'localhost',
      stateful: true,
      enableCors: true,
      corsOrigin: '*',
      ...options
    };
    
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    
    if (this.options.enableCors) {
      this.app.use(cors({
        origin: this.options.corsOrigin,
        exposedHeaders: ['Mcp-Session-Id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id'],
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      }));
    }
  }

  private createServer(): Server {
    const server = new Server(
      { name: 'transporeon-company-settings', version: '1.0.0' },
      { capabilities: { resources: {}, tools: {} } }
    );

    // Set up all existing handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        { 
          uri: 'info://status', 
          name: 'Server Status', 
          description: 'Current server status', 
          mimeType: 'text/plain' 
        },
      ],
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'info://status') {
        return {
          contents: [
            { 
              uri: 'info://status', 
              mimeType: 'text/plain', 
              text: 'Transporeon Company Settings MCP HTTP server is running.' 
            },
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
        return { 
          content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }, null, 2) }], 
          isError: true 
        };
      }
    });

    return server;
  }

  private setupRoutes() {
    if (this.options.stateful) {
      this.setupStatefulRoutes();
    } else {
      this.setupStatelessRoutes();
    }
  }

  private setupStatefulRoutes() {
    // Handle POST requests for client-to-server communication
    this.app.post('/mcp', async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports[sessionId]) {
          // Reuse existing transport
          transport = this.transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
              this.transports[sessionId] = transport;
              console.log(`✅ New session initialized: ${sessionId}`);
            },
            enableDnsRebindingProtection: true,
            allowedHosts: ['127.0.0.1', 'localhost'],
          });

          // Clean up transport when closed
          transport.onclose = () => {
            if (transport.sessionId) {
              console.log(`🔄 Session terminated: ${transport.sessionId}`);
              delete this.transports[transport.sessionId];
            }
          };

          const server = this.createServer();
          await server.connect(transport);
        } else {
          // Invalid request
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
          return;
        }

        // Handle the request
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('❌ Error in POST /mcp:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    // Handle GET requests for server-to-client notifications via SSE
    this.app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    });

    // Handle DELETE requests for session termination
    this.app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    });
  }

  private setupStatelessRoutes() {
    // Handle POST requests (stateless mode)
    this.app.post('/mcp', async (req, res) => {
      try {
        const server = this.createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Disable sessions
        });

        res.on('close', () => {
          transport.close();
          server.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('❌ Error in stateless POST /mcp:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    // SSE notifications not supported in stateless mode
    this.app.get('/mcp', (req, res) => {
      res.status(405).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed in stateless mode."
        },
        id: null
      });
    });

    // Session termination not needed in stateless mode
    this.app.delete('/mcp', (req, res) => {
      res.status(405).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed in stateless mode."
        },
        id: null
      });
    });
  }

  async start(): Promise<void> {
    try {
      // Load and validate configuration
      console.log('🔧 Loading configuration...');
      this.config = loadConfig();
      console.log(`✅ Configuration loaded. Environment: ${this.config.defaultEnvironment}`);

      // Validate token
      console.log('🔐 Validating API token...');
      const isTokenValid = await validateToken(this.config);
      if (!isTokenValid) {
        console.error('❌ Token validation failed. Please check your token configuration:');
        console.error('  - Environment-specific tokens: TP_SETTINGS_TOKEN_PD, TP_SETTINGS_TOKEN_IN, TP_SETTINGS_TOKEN_AC');
        console.error('  - Or single token (legacy): TP_SETTINGS_TOKEN');
        process.exit(1);
      }
      console.log('✅ Token validation successful.');

      // Start HTTP server
      this.app.listen(this.options.port, this.options.host, () => {
        const mode = this.options.stateful ? 'stateful' : 'stateless';
        console.log(`🚀 Transporeon Company Settings MCP HTTP Server (${mode})`);
        console.log(`   Running on http://${this.options.host}:${this.options.port}/mcp`);
        console.log(`   CORS: ${this.options.enableCors ? 'enabled' : 'disabled'}`);
        console.log(`   Environment: ${this.config.defaultEnvironment}`);
      });
    } catch (error) {
      console.error('❌ Failed to start HTTP MCP server:');
      console.error(error instanceof Error ? error.message : String(error));
      console.error('\nPlease check:');
      console.error('1. Your token configuration');
      console.error('2. You have VPN access to Transporeon network');
      console.error('3. Your tokens are valid and have appropriate permissions');
      process.exit(1);
    }
  }

  getActiveSessionCount(): number {
    return Object.keys(this.transports).length;
  }

  getSessionIds(): string[] {
    return Object.keys(this.transports);
  }
}
```

### Step 3: Modify `src/index.ts`

#### 3.1 Update Imports and Main Function

Replace the existing `index.ts` content with:

```typescript
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
import { HttpMcpServer } from './httpServer.js';

async function startStdioServer() {
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
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 Transporeon Company Settings MCP Server running on stdio transport');
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

async function startHttpServer(options: { port?: number; stateful?: boolean } = {}) {
  const httpServer = new HttpMcpServer({
    port: options.port || 3000,
    host: 'localhost',
    stateful: options.stateful ?? true,
    enableCors: true,
    corsOrigin: '*'
  });

  await httpServer.start();
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const transportArg = args.find(arg => arg.startsWith('--transport='))?.split('=')[1];
  const transport = transportArg || (args.includes('--transport') ? args[args.indexOf('--transport') + 1] : 'stdio');
  
  const portArg = args.find(arg => arg.startsWith('--port='))?.split('=')[1];
  const port = portArg ? parseInt(portArg, 10) : 3000;
  
  const stateful = !args.includes('--stateless');

  console.log(`🔄 Starting MCP Server with ${transport} transport...`);

  if (transport === 'streamable-http' || transport === 'http') {
    await startHttpServer({ port, stateful });
  } else if (transport === 'stdio') {
    await startStdioServer();
  } else {
    console.error(`❌ Unknown transport: ${transport}`);
    console.error('Available transports: stdio, streamable-http, http');
    console.error('Usage: npm start -- --transport=streamable-http --port=3000 [--stateless]');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### Step 4: Update `package.json` Scripts

#### 4.1 Add New Scripts

```json
{
  "scripts": {
    "start": "tsx src/index.ts",
    "start:stdio": "tsx src/index.ts --transport=stdio",
    "start:http": "tsx src/index.ts --transport=streamable-http",
    "start:http-stateless": "tsx src/index.ts --transport=streamable-http --stateless",
    "start:http-port": "tsx src/index.ts --transport=streamable-http --port=8080",
    "build": "tsc",
    "dev": "tsx watch src/index.ts"
  }
}
```

### Step 5: Testing the Implementation

#### 5.1 Test STDIO Transport (Existing)

```bash
npm run start:stdio
```

#### 5.2 Test HTTP Transport (New)

```bash
# Stateful HTTP server (default)
npm run start:http

# Stateless HTTP server
npm run start:http-stateless

# Custom port
npm run start:http-port
```

#### 5.3 Test HTTP Endpoints

**Initialize Session (POST):**
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

**List Tools:**
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <session-id-from-initialize>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 2
  }'
```

**Call Tool (List Company Settings):**
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_company_settings",
      "arguments": {
        "companyId": 123,
        "environment": "pd"
      }
    },
    "id": 3
  }'
```

---

## 🔧 Configuration Options

### Environment Variables

The same environment variables work for both transports:

```bash
# Required: API Tokens
TP_SETTINGS_TOKEN_PD=your_pd_token
TP_SETTINGS_TOKEN_IN=your_in_token  
TP_SETTINGS_TOKEN_AC=your_ac_token

# OR single token (legacy)
TP_SETTINGS_TOKEN=your_token

# Optional: Configuration
TP_SETTINGS_DEFAULT_ENV=pd
TP_SETTINGS_TIMEOUT=30000
TP_SETTINGS_BASE_PD=http://tpadmin.pd.tp.nil/api/internal/v1
TP_SETTINGS_BASE_IN=http://tpadmin.in.tp.nil/api/internal/v1
TP_SETTINGS_BASE_AC=http://tpadmin.ac.tp.nil/api/internal/v1
```

### Command Line Options

```bash
# Transport selection
--transport=stdio           # Default STDIO transport
--transport=streamable-http # HTTP transport
--transport=http           # Alias for streamable-http

# HTTP-specific options
--port=3000                # Custom port (default: 3000)
--stateless               # Disable session management
--host=localhost          # Custom host (default: localhost)
```

---

## 🌐 Client Integration

### Browser JavaScript Client

```javascript
class McpHttpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sessionId = null;
  }

  async initialize() {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'web-client', version: '1.0.0' }
        },
        id: 1
      })
    });

    const result = await response.json();
    this.sessionId = response.headers.get('Mcp-Session-Id');
    return result;
  }

  async listTools() {
    return this.request('tools/list');
  }

  async callTool(name, args) {
    return this.request('tools/call', { name, arguments: args });
  }

  async request(method, params = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now()
      })
    });

    return response.json();
  }
}

// Usage
const client = new McpHttpClient('http://localhost:3000');
await client.initialize();
const tools = await client.listTools();
const result = await client.callTool('list_company_settings', { 
  companyId: 123, 
  environment: 'pd' 
});
```

### Node.js Client using MCP SDK

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({
  name: 'company-settings-client',
  version: '1.0.0'
});

const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp')
);

await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools);

// Call a tool
const result = await client.callTool('list_company_settings', {
  companyId: 123,
  environment: 'pd'
});
console.log('Result:', result);
```

---

## 🚀 Deployment Considerations

### Development
```bash
npm run start:http
```

### Production

#### Using PM2
```bash
npm install -g pm2
pm2 start "npm run start:http" --name "mcp-company-settings"
pm2 startup
pm2 save
```

#### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:http"]
```

#### Behind Reverse Proxy (nginx)
```nginx
location /mcp {
    proxy_pass http://localhost:3000/mcp;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

---

## 🔍 Troubleshooting

### Common Issues

#### 1. CORS Errors in Browser
```javascript
// Enable CORS in httpServer.ts
app.use(cors({
  origin: ['https://yourdomain.com', 'http://localhost:3000'],
  exposedHeaders: ['Mcp-Session-Id'],
  allowedHeaders: ['Content-Type', 'mcp-session-id'],
}));
```

#### 2. Session Management Issues
```bash
# Check active sessions
curl -X GET http://localhost:3000/mcp/debug/sessions

# Force session cleanup
curl -X DELETE http://localhost:3000/mcp \
  -H "mcp-session-id: <session-id>"
```

#### 3. Token Validation Failures
```bash
# Test tokens manually
npm run verify-tokens

# Check environment variables
echo $TP_SETTINGS_TOKEN_PD
```

### Debug Mode

Add debug logging to `httpServer.ts`:

```typescript
// Add after line 15
const DEBUG = process.env.DEBUG === 'true';
const debug = (msg: string, ...args: any[]) => {
  if (DEBUG) console.log(`[DEBUG] ${msg}`, ...args);
};
```

Run with debug:
```bash
DEBUG=true npm run start:http
```

### Health Check Endpoint

Add to `httpServer.ts`:

```typescript
// Add to setupRoutes()
this.app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    transport: 'streamable-http',
    sessions: this.getActiveSessionCount(),
    uptime: process.uptime()
  });
});
```

---

## 📊 Benefits of HTTP Transport

### ✅ Advantages
- **Web Browser Support**: Direct integration with web applications
- **Standard HTTP**: RESTful API patterns, familiar debugging tools
- **Server-Sent Events**: Real-time notifications via GET endpoint
- **Session Management**: Stateful connections with resumability
- **CORS Support**: Cross-origin requests from browsers
- **Load Balancing**: Can be deployed behind load balancers
- **Monitoring**: Standard HTTP monitoring and logging tools

### ⚠️ Considerations
- **Complexity**: More complex than STDIO transport
- **Resource Usage**: HTTP server overhead vs direct STDIO
- **Security**: Need to configure CORS, authentication, HTTPS
- **Dependencies**: Additional npm packages required

### 🔄 Migration Strategy
1. **Phase 1**: Implement HTTP transport (this guide)
2. **Phase 2**: Test both transports in parallel
3. **Phase 3**: Gradually migrate clients to HTTP
4. **Phase 4**: Remove STDIO transport when no longer needed

---

## ✅ Verification Checklist

- [ ] Dependencies installed (`express`, `cors`, `@types/express`, `@types/cors`)
- [ ] `httpServer.ts` created with full implementation
- [ ] `index.ts` updated with transport selection logic
- [ ] `package.json` scripts updated
- [ ] Environment variables configured
- [ ] STDIO transport still works (`npm run start:stdio`)
- [ ] HTTP transport starts (`npm run start:http`)
- [ ] HTTP endpoints respond to curl tests
- [ ] Session management works (stateful mode)
- [ ] Stateless mode works (`npm run start:http-stateless`)
- [ ] CORS headers present in responses
- [ ] All existing tools still function
- [ ] Error handling works properly

---

## 📚 Additional Resources

- [MCP TypeScript SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Express.js Documentation](https://expressjs.com/)
- [Server-Sent Events (SSE) Guide](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

---

*Created: October 2025*  
*Last Updated: October 2025*  
*Version: 1.0.0*
