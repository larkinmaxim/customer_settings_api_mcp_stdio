# Transporeon Company Settings MCP Server

A Model Context Protocol (MCP) server that provides intelligent access to Transporeon's internal company settings API. This server enables AI assistants to retrieve, search, and analyze company configuration settings across different environments with smart pagination and search capabilities.

⚠️ **Internal Use Only**: This server is designed exclusively for internal Transporeon use and requires VPN access to internal network resources.

## Features

- 🔍 **Smart Search**: Find specific content within large configuration files with line numbers and context
- 📄 **Line-Based Pagination**: Navigate through large settings efficiently using line ranges
- 🎯 **Multi-Environment Support**: Access settings across Production, Integration, and Acceptance environments
- 🔐 **Secure Authentication**: Bearer token authentication with automatic encoding/decoding
- ⚡ **Intelligent Processing**: Automatic base64 decoding and XML formatting for readability
- 📊 **Comprehensive Filtering**: Filter by setting type, owner, and child objects

## Installation

### Prerequisites

- Node.js 18 or higher
- VPN access to Transporeon internal network
- Valid API bearer token
- [Cursor IDE](https://cursor.sh/) or any MCP-compatible client

### Quick Start

#### Automated Installation (Recommended)

1. **Clone the repository**

   ```bash
   git -c http.sslVerify=false clone https://github.com/larkinmaxim/customer_settings_api_mcp_stdio.git
   ```
2. **Run the automated setup script**

   **Default way (beginner-friendly):**

   - Right-click on `setup.ps1` in File Explorer
   - Select "Run with PowerShell" from the context menu
   - Follow the on-screen prompts

   **Alternative way (advanced users):**

   ```powershell
   # If execution policy prevents running scripts, first enable it:
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

   # Then run the setup script:
   .\setup.ps1
   ```

   The setup script will automatically:

   - Install all dependencies
   - Build the project
   - Generate or update your Cursor MCP configuration
   - Test the server startup

#### Manual Installation

1. **Install dependencies**

   ```bash
   npm install
   ```
2. **Build the project**

   ```bash
   npm run build
   ```
3. **Configure Cursor**

   Add to your Cursor settings (`.cursor/mcp.json`):

   ```json
   {
     "mcpServers": {
       "company-settings": {
         "command": "node",
         "args": ["/absolute/path/to/company-settings-mcp/dist/index.js"],
         "env": {
           "TP_SETTINGS_TOKEN_PD": "your-production-token-here",
           "TP_SETTINGS_TOKEN_IN": "your-integration-token-here",
           "TP_SETTINGS_TOKEN_AC": "your-acceptance-token-here"
         }
       }
     }
   }
   ```

## Usage

Once configured, the MCP server provides these tools to AI assistants:

### List Company Settings

```typescript
// Get all settings for a company with optional filtering
list_company_settings({ 
  companyId: 273471, 
  environment: "pd",
  type: "COMPANY" 
})
```

### Get Specific Setting with Pagination

```typescript
// Get lines 1667-1700 of a specific setting
get_company_setting({ 
  companyId: 273471,
  keyName: "tsmConfig",
  environment: "pd",
  offset: 1666,  // Start from line 1667 (0-based)
  limit: 34       // Get 34 lines (1667-1700)
})
```

### Search Within Settings

```typescript
// Find all occurrences of "otherTruckSize" with context
search_in_setting({ 
  companyId: 273471,
  keyName: "tsmConfig", 
  searchTerm: "otherTruckSize",
  contextLines: 3
})
```

## How It Works

1. **Smart Authentication**: Secure bearer token authentication with automatic validation
2. **Intelligent Decoding**: Automatically detects and decodes base64-encoded settings
3. **Line-Based Navigation**: Navigate large XML configurations using line numbers from search results
4. **Context-Aware Search**: Find content with surrounding lines for better understanding

## Configuration

### Environments

- **`pd`** - Production (default)
- **`in`** - Integration
- **`ac`** - Acceptance

### Authentication

The MCP server requires separate tokens for each environment:

- `TP_SETTINGS_TOKEN_PD` - Production environment token
- `TP_SETTINGS_TOKEN_IN` - Integration environment token
- `TP_SETTINGS_TOKEN_AC` - Acceptance environment token

All three environment tokens must be provided for the server to function properly. The automated setup script includes default tokens for internal Transporeon use.

## Development

```bash
# Run TypeScript compiler in watch mode
npm run dev

# Start the server directly
npm start
```

### Project Structure

```
transporeon-company-settings-mcp/
├── src/
│   ├── index.ts          # MCP server wiring and request handlers
│   ├── handlers.ts       # Tool implementations  
│   ├── settingsClient.ts # API client and business logic
│   ├── toolSchemas.ts    # Tool schemas exposed to MCP
│   ├── config.ts         # Configuration management
│   ├── constants.ts      # Application constants
│   └── types.ts          # TypeScript interfaces
├── dist/                 # Compiled JavaScript (generated)
├── Documentation/        # Project documentation
├── package.json
├── tsconfig.json
└── README.md
```

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled server
- `npm run dev` - Development mode with watch
- `npm run clean` - Remove compiled files

## ⚠️ Important Notes

### Security & Access Control

- **VPN Required**: This server only works within the Transporeon internal network
- **Bearer Token**: Secure API token authentication required
- **Internal Use**: Designed exclusively for Transporeon employees and authorized personnel
- **Network Isolation**: API endpoints are not accessible from the public internet

### API Limitations

- Internal API only - not guaranteed to be stable
- May have incompatible changes without notice
- Rate limiting may apply

### Performance Tips

- Use line-based pagination for large settings (limit + offset)
- Search first to find relevant line numbers, then use pagination to get specific ranges
- Line numbers from search results can be used directly with pagination offset

## Troubleshooting

### Connection Issues

- Verify VPN connection is active
- Check if you can access Transporeon admin dashboard
- Try different environments (pd, in, ac)

### Authentication Errors

- Ensure all three environment token variables are set: `TP_SETTINGS_TOKEN_PD`, `TP_SETTINGS_TOKEN_IN`, `TP_SETTINGS_TOKEN_AC`
- Verify tokens have necessary permissions for respective environments
- Check token expiration with system administrators

### No Results

- Verify company ID is correct
- Check if setting exists in the specified environment
- Ensure correct setting key name format

### Performance Issues

- Use pagination for large settings (limit < 50 lines recommended)
- Search for specific content instead of retrieving entire settings
- Consider using different environments if one is slow

## Support

- **API Issues**: Contact the Company Settings API maintainer
- **Network Access**: Contact Transporeon IT for VPN access and network configuration
- **Token Management**: Contact system administrators for API token issues
- **MCP Issues**: Check the main project documentation or development team

## License

MIT
