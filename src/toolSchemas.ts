import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
  {
    name: 'list_company_settings',
    description: 'List all company settings from the Transporeon settings API. Returns settings formatted as Markdown with decoded values for encoded settings.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { 
          type: 'integer', 
          description: 'Company ID (integer)' 
        },
        environment: {
          type: 'string',
          enum: ['pd', 'in', 'ac'],
          description: 'Environment: pd (default), in, or ac',
          default: 'pd',
        },
        keyName: {
          type: 'string',
          description: 'Optional: Filter by specific setting key name'
        },
        type: {
          type: 'string',
          enum: ['APPLICATION', 'COMPANY', 'SCHEDULING_UNIT', 'USER'],
          description: 'Optional: Filter by setting type'
        },
        owner: {
          type: 'integer',
          description: 'Optional: Filter by owner ID'
        },
        childObject: {
          type: 'integer',
          description: 'Optional: Filter by child object ID'
        }
      },
      required: ['companyId'],
    },
  },
  {
    name: 'get_company_setting',
    description: 'Get a specific company setting by key name. Returns the setting with decoded value if it was encoded.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { 
          type: 'integer', 
          description: 'Company ID (integer)' 
        },
        keyName: {
          type: 'string',
          description: 'Setting key name to retrieve'
        },
        environment: {
          type: 'string',
          enum: ['pd', 'in', 'ac'],
          description: 'Environment: pd (default), in, or ac',
          default: 'pd',
        },
        type: {
          type: 'string',
          enum: ['APPLICATION', 'COMPANY', 'SCHEDULING_UNIT', 'USER'],
          description: 'Optional: Filter by setting type (defaults to COMPANY)'
        },
        owner: {
          type: 'integer',
          description: 'Optional: Filter by owner ID'
        },
        childObject: {
          type: 'integer',
          description: 'Optional: Filter by child object ID'
        },
        limit: {
          type: 'integer',
          description: 'Optional: Limit the number of lines returned (useful for very long settings)',
          minimum: 1
        },
        offset: {
          type: 'integer',
          description: 'Optional: Number of lines to skip from the beginning (for pagination)',
          minimum: 0
        }
      },
      required: ['companyId', 'keyName'],
    },
  },
  {
    name: 'search_in_setting',
    description: 'Search for specific text within a company setting and return matching lines with surrounding context.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { 
          type: 'integer', 
          description: 'Company ID (integer)' 
        },
        keyName: {
          type: 'string',
          description: 'Setting key name to search within'
        },
        searchTerm: {
          type: 'string',
          description: 'Text to search for within the setting value'
        },
        environment: {
          type: 'string',
          enum: ['pd', 'in', 'ac'],
          description: 'Environment: pd (default), in, or ac',
          default: 'pd',
        },
        type: {
          type: 'string',
          enum: ['APPLICATION', 'COMPANY', 'SCHEDULING_UNIT', 'USER'],
          description: 'Optional: Filter by setting type (defaults to COMPANY)'
        },
        owner: {
          type: 'integer',
          description: 'Optional: Filter by owner ID'
        },
        childObject: {
          type: 'integer',
          description: 'Optional: Filter by child object ID'
        },
        contextLines: {
          type: 'integer',
          description: 'Number of lines before and after each match to include (default: 3)',
          default: 3,
          minimum: 0
        }
      },
      required: ['companyId', 'keyName', 'searchTerm'],
    },
  },
  {
    name: 'verify_environment_tokens',
    description: 'Verify that all environment tokens (pd, in, ac) are valid by making test requests to each environment. This helps diagnose authentication issues.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

export default tools;
