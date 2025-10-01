import axios, { ResponseType } from 'axios';
import { promisify } from 'util';
import { parseString } from 'xml2js';
import { loadConfig } from './config.js';
import { RequestResult, Setting, SettingEnvironment, SettingsResponse } from './types.js';

const parseXML = promisify(parseString);

export class Base64Utils {
  static encode(content: Buffer): string {
    return content.toString('base64');
  }

  static decode(encodedContent: string): string | null {
    try {
      const buffer = Buffer.from(encodedContent, 'base64');
      return buffer.toString('utf-8');
    } catch {
      return null;
    }
  }

  static isBase64(str: string): boolean {
    try {
      return Buffer.from(str, 'base64').toString('base64') === str;
    } catch {
      return false;
    }
  }
}

export class CompanySettingsClient {
  private static _config: any = null;

  private static getConfig() {
    if (!this._config) {
      this._config = loadConfig();
    }
    return this._config;
  }

  static get config() {
    return this.getConfig();
  }

  static async verifyEnvironmentTokens(): Promise<{[env: string]: { valid: boolean, error?: string }}> {
    const results: {[env: string]: { valid: boolean, error?: string }} = {};
    const environments: SettingEnvironment[] = ['pd' as SettingEnvironment, 'in' as SettingEnvironment, 'ac' as SettingEnvironment];
    
    for (const env of environments) {
      try {
        const testUrl = `${this.config.baseUrls[env]}/setting/company/1`;
        const token = this.config.tokens[env];
        
        console.log(`[DEBUG] Testing token for environment: ${env}`);
        console.log(`[DEBUG] Test URL: ${testUrl}`);
        console.log(`[DEBUG] Token (first 10 chars): ${token?.substring(0, 10)}...`);
        
        const response = await axios.get(testUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          timeout: this.config.timeout,
          validateStatus: (status) => status < 500 // Accept 400s as valid auth, but not 500s
        });

        if (response.status === 401 || response.status === 403) {
          results[env] = { 
            valid: false, 
            error: `Authentication failed (${response.status}) - token appears to be invalid or expired for environment '${env}'`
          };
        } else {
          results[env] = { valid: true };
        }
      } catch (error: any) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 401 || status === 403) {
            results[env] = { 
              valid: false, 
              error: `Authentication failed (${status}) - token appears to be invalid or expired for environment '${env}'`
            };
          } else {
            results[env] = { 
              valid: true,  // Network errors suggest token format is OK
              error: `Network error (${status}): ${error.message}`
            };
          }
        } else {
          results[env] = { 
            valid: false, 
            error: `Unexpected error testing environment '${env}': ${error.message}`
          };
        }
      }
    }
    
    return results;
  }

  static buildBaseUrl(environment: SettingEnvironment): string {
    return this.config.baseUrls[environment];
  }

  static async makeRequest(
    url: string,
    params: Record<string, any>,
    environment: SettingEnvironment,
    options?: { responseType?: ResponseType; headers?: Record<string, string> }
  ): Promise<RequestResult> {
    const maxAttempts = 3;
    const baseDelayMs = 250;
    let lastError: RequestResult | null = null;

    // Debug logging to verify correct environment handling
    const selectedToken = this.config.tokens[environment];
    const selectedBaseUrl = this.config.baseUrls[environment];
    
    console.log(`[DEBUG] Making request for environment: ${environment}`);
    console.log(`[DEBUG] Selected base URL: ${selectedBaseUrl}`);
    console.log(`[DEBUG] Selected token (first 10 chars): ${selectedToken?.substring(0, 10)}...`);
    console.log(`[DEBUG] Full URL: ${url}`);
    console.log(`[DEBUG] Request params:`, params);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const headers = {
          'Authorization': `Bearer ${selectedToken}`,
          ...options?.headers
        };

        const response = await axios.get(url, {
          params,
          timeout: this.config.timeout,
          validateStatus: null,
          responseType: options?.responseType || 'text',
          headers
        });

        if (response.status === 200) {
          return { success: true, response, status_code: response.status };
        } else {
          // Enhanced error message for authentication issues
          const errorMessage = response.status === 403 
            ? `API returned status ${response.status} (Forbidden) for environment '${environment}'. This usually indicates an invalid or expired token for this environment.`
            : response.status === 401
            ? `API returned status ${response.status} (Unauthorized) for environment '${environment}'. Please check your token for this environment.`
            : `API returned status ${response.status}`;

          lastError = {
            success: false,
            error: errorMessage,
            status_code: response.status,
            response_text:
              typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
            environment,
            base_url: selectedBaseUrl,
            token_preview: selectedToken?.substring(0, 10) + '...'
          };
        }
      } catch (error: any) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const data = error.response?.data;
          
          const errorMessage = status === 403 
            ? `Request failed with status ${status} (Forbidden) for environment '${environment}'. This usually indicates an invalid or expired token for this environment: ${error.message}`
            : status === 401
            ? `Request failed with status ${status} (Unauthorized) for environment '${environment}'. Please check your token for this environment: ${error.message}`
            : `Request failed${status ? ` with status ${status}` : ''}: ${error.message}`;

          lastError = {
            success: false,
            error: errorMessage,
            status_code: status,
            response_text: typeof data === 'string' ? data : data ? JSON.stringify(data) : undefined,
            environment,
            base_url: selectedBaseUrl,
            token_preview: selectedToken?.substring(0, 10) + '...'
          };
        } else {
          lastError = { 
            success: false, 
            error: `Unexpected error for environment '${environment}': ${error.message || error}`,
            environment,
            base_url: selectedBaseUrl,
            token_preview: selectedToken?.substring(0, 10) + '...'
          };
        }
      }

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    return lastError || { success: false, error: 'Unknown error' };
  }

  static async parseAPIResponse(responseData: any): Promise<Setting[]> {
    try {
      let data;
      
      // Handle both JSON and XML responses
      if (typeof responseData === 'string') {
        // Check if it's JSON or XML
        const trimmed = responseData.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          // JSON response
          data = JSON.parse(responseData);
        } else if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
          // XML response - remove BOM if present
          let cleanXmlData = responseData.replace(/^\uFEFF/, '');
          cleanXmlData = cleanXmlData.replace(/^[\ufeff\ufffe\uffff]/, '');
          const result = await parseXML(cleanXmlData) as SettingsResponse;
          data = result;
        } else {
          throw new Error('Unknown response format');
        }
      } else {
        data = responseData;
      }

      let settings: any[] = [];

      // Handle JSON format: {"settingDtoList": [...]}
      if (data.settingDtoList) {
        settings = data.settingDtoList;
      }
      // Handle XML format: {"settings": {"setting": [...]}}
      else if (data.settings?.setting) {
        settings = Array.isArray(data.settings.setting) 
          ? data.settings.setting 
          : [data.settings.setting];
      }
      else {
        return [];
      }

      return settings.map(setting => ({
        setting_uuid: setting.settingUuid || setting.setting_uuid,
        type: setting.type as any,
        key: setting.key,
        value: setting.value,
        encoded: setting.encoded,
        encrypted: setting.encrypted,
        owner: parseInt(String(setting.owner)),
        revision: parseInt(String(setting.revision)),
        deleted: String(setting.deleted) === 'true',
        created: setting.created,
        modified: setting.modified
      }));
    } catch (error) {
      throw new Error(`Failed to parse API response: ${error instanceof Error ? error.message : error}`);
    }
  }

  static decodeSetting(setting: Setting): Setting {
    if (!setting.encoded || setting.encrypted) {
      return setting;
    }

    const decodedValue = Base64Utils.decode(setting.value);
    if (decodedValue !== null) {
      return {
        ...setting,
        value: decodedValue
      };
    }

    return setting;
  }

  static formatSettingsAsMarkdown(settings: Setting[]): string {
    if (settings.length === 0) {
      return '# Company Settings\n\nNo settings found.';
    }

    let markdown = '# Company Settings\n\n';
    markdown += `Found ${settings.length} setting(s)\n\n`;

    // Group by type
    const groupedByType = settings.reduce((acc, setting) => {
      if (!acc[setting.type]) {
        acc[setting.type] = [];
      }
      acc[setting.type].push(setting);
      return acc;
    }, {} as Record<string, Setting[]>);

    Object.keys(groupedByType).forEach(type => {
      markdown += `## ${type} Settings\n\n`;
      
      groupedByType[type].forEach(setting => {
        const status = setting.deleted ? ' 🗑️ (deleted)' : setting.encrypted ? ' 🔒 (encrypted)' : '';
        markdown += `- **${setting.key}**${status}\n`;
      });
      
      markdown += '\n';
    });

    return markdown;
  }

  static paginateSettingValue(value: string, limit?: number, offset?: number): { lines: string[], totalLines: number, hasMore: boolean } {
    // Split by literal \n characters in the decoded content (same as search function)
    const lines = value.split('\n');
    const totalLines = lines.length;
    
    if (!limit && !offset) {
      return { lines, totalLines, hasMore: false };
    }
    
    const startIndex = offset || 0;
    const endIndex = limit ? startIndex + limit : lines.length;
    const paginatedLines = lines.slice(startIndex, endIndex);
    
    return {
      lines: paginatedLines,
      totalLines,
      hasMore: endIndex < totalLines
    };
  }

  static searchInSettingValue(value: string, searchTerm: string, contextLines: number = 3): { matches: Array<{ lineNumber: number, line: string, context: string[] }>, totalMatches: number } {
    // Split by literal \n characters in the decoded content
    const lines = value.split('\n');
    const matches: Array<{ lineNumber: number, line: string, context: string[] }> = [];
    const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    
    lines.forEach((line, index) => {
      if (searchRegex.test(line)) {
        const startContext = Math.max(0, index - contextLines);
        const endContext = Math.min(lines.length - 1, index + contextLines);
        
        const context: string[] = [];
        for (let i = startContext; i <= endContext; i++) {
          const prefix = i === index ? '>>> ' : '    ';
          context.push(`${prefix}${i + 1}: ${lines[i]}`);
        }
        
        matches.push({
          lineNumber: index + 1,
          line: lines[index],
          context
        });
      }
    });
    
    return {
      matches,
      totalMatches: matches.length
    };
  }

  private static formatBaseSettingInfo(setting: Setting): any {
    return {
      uuid: setting.setting_uuid,
      key: setting.key,
      type: setting.type,
      owner: setting.owner,
      revision: setting.revision,
      deleted: setting.deleted,
      created: setting.created,
      modified: setting.modified
    };
  }

  static formatPaginatedSetting(setting: Setting, paginationResult: { lines: string[], totalLines: number, hasMore: boolean }, limit?: number, offset?: number): any {
    // Join with actual newlines to maintain proper formatting
    const displayValue = paginationResult.lines.join('\n');
    
    return {
      ...this.formatBaseSettingInfo(setting),
      value: displayValue,
      raw_value: displayValue, // Return paginated content as raw_value
      pagination: {
        totalLines: paginationResult.totalLines,
        displayedLines: paginationResult.lines.length,
        offset: offset || 0,
        limit: limit,
        hasMore: paginationResult.hasMore
      }
    };
  }

  static formatSingleSetting(setting: Setting): any {
    return {
      ...this.formatBaseSettingInfo(setting),
      value: setting.value, // setting.value is already decoded
      raw_value: setting.value,
      decoded: false // No decoding applied since setting.value is already decoded
    };
  }

  static formatSearchResults(setting: Setting, searchResults: { matches: Array<{ lineNumber: number, line: string, context: string[] }>, totalMatches: number }, searchTerm: string): any {
    return {
      ...this.formatBaseSettingInfo(setting),
      searchTerm,
      totalMatches: searchResults.totalMatches,
      matches: searchResults.matches
    };
  }
}
