import { CompanySettingsClient } from './settingsClient.js';
import { GetSettingArgs, ListSettingsArgs, SearchInSettingArgs, SettingEnvironment } from './types.js';

export { GetSettingArgs, ListSettingsArgs, SearchInSettingArgs };

export async function handleListCompanySettings(args: ListSettingsArgs): Promise<any> {
  const { companyId, environment = 'pd', keyName, type, owner, childObject } = args;
  
  const baseUrl = CompanySettingsClient.buildBaseUrl(environment as SettingEnvironment);
  const url = `${baseUrl}/setting/company/${companyId}`;
  
  const params: any = {};
  if (keyName) params['key-name'] = keyName;
  if (type) params.type = type;
  if (owner) params.owner = owner;
  if (childObject) params['child-object'] = childObject;
  
  const result = await CompanySettingsClient.makeRequest(url, params, environment as SettingEnvironment);
  
  if (result.success && result.response) {
    try {
      const settings = await CompanySettingsClient.parseAPIResponse(result.response.data);
      const markdown = CompanySettingsClient.formatSettingsAsMarkdown(settings);
      
      return {
        success: true,
        markdown,
        settings_count: settings.length,
        status_code: result.status_code
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to process settings: ${error instanceof Error ? error.message : error}`,
        status_code: result.status_code
      };
    }
  } else {
    return result;
  }
}

export async function handleGetCompanySetting(args: GetSettingArgs): Promise<any> {
  const { companyId, keyName, environment = 'pd', type, owner, childObject, limit, offset } = args;
  
  const baseUrl = CompanySettingsClient.buildBaseUrl(environment as SettingEnvironment);
  const url = `${baseUrl}/setting/company/${companyId}`;
  
  const params: any = { 'key-name': keyName };
  if (type) params.type = type;
  if (owner) params.owner = owner;
  if (childObject) params['child-object'] = childObject;
  
  const result = await CompanySettingsClient.makeRequest(url, params, environment as SettingEnvironment);
  
  if (result.success && result.response) {
    try {
      const settings = await CompanySettingsClient.parseAPIResponse(result.response.data);
      
      if (settings.length === 0) {
        return {
          success: false,
          error: `Setting with key '${keyName}' not found`,
          status_code: result.status_code
        };
      }
      
      // Find the exact match for the key
      const setting = settings.find(s => s.key === keyName);
      if (!setting) {
        return {
          success: false,
          error: `Setting with key '${keyName}' not found`,
          status_code: result.status_code
        };
      }
      
      // Handle pagination if limit or offset is provided
      if (limit || offset) {
        // Use setting.value directly as it's already decoded (don't double-decode)
        const valueToPage = setting.value;
        const paginationResult = CompanySettingsClient.paginateSettingValue(valueToPage, limit, offset);
        const paginatedSetting = CompanySettingsClient.formatPaginatedSetting(setting, paginationResult, limit, offset);
        
        return {
          success: true,
          setting: paginatedSetting,
          status_code: result.status_code
        };
      }
      
      return {
        success: true,
        setting: CompanySettingsClient.formatSingleSetting(setting),
        status_code: result.status_code
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to process setting: ${error instanceof Error ? error.message : error}`,
        status_code: result.status_code
      };
    }
  } else {
    return result;
  }
}

export async function handleVerifyTokens(): Promise<any> {
  try {
    console.log('[DEBUG] Starting environment token verification...');
    const results = await CompanySettingsClient.verifyEnvironmentTokens();
    
    const summary = {
      success: true,
      message: 'Token verification completed',
      environments: results,
      overall_status: Object.values(results).every(r => r.valid) ? 'All tokens valid' : 'Some tokens have issues'
    };
    
    console.log('[DEBUG] Token verification results:', summary);
    return summary;
  } catch (error) {
    return {
      success: false,
      error: `Failed to verify tokens: ${error instanceof Error ? error.message : error}`
    };
  }
}

export async function handleSearchInSetting(args: SearchInSettingArgs): Promise<any> {
  const { companyId, keyName, searchTerm, environment = 'pd', type, owner, childObject, contextLines = 3 } = args;
  
  const baseUrl = CompanySettingsClient.buildBaseUrl(environment as SettingEnvironment);
  const url = `${baseUrl}/setting/company/${companyId}`;
  
  const params: any = { 'key-name': keyName };
  if (type) params.type = type;
  if (owner) params.owner = owner;
  if (childObject) params['child-object'] = childObject;
  
  const result = await CompanySettingsClient.makeRequest(url, params, environment as SettingEnvironment);
  
  if (result.success && result.response) {
    try {
      const settings = await CompanySettingsClient.parseAPIResponse(result.response.data);
      
      if (settings.length === 0) {
        return {
          success: false,
          error: `Setting with key '${keyName}' not found`,
          status_code: result.status_code
        };
      }
      
      // Find the exact match for the key
      const setting = settings.find(s => s.key === keyName);
      if (!setting) {
        return {
          success: false,
          error: `Setting with key '${keyName}' not found`,
          status_code: result.status_code
        };
      }
      
      if (setting.encrypted) {
        return {
          success: false,
          error: `Cannot search in encrypted setting '${keyName}'`,
          status_code: result.status_code
        };
      }
      
      // Use setting.value directly as it's already decoded (don't double-decode)
      const searchResults = CompanySettingsClient.searchInSettingValue(setting.value, searchTerm, contextLines);
      
      if (searchResults.totalMatches === 0) {
        return {
          success: true,
          message: `No matches found for '${searchTerm}' in setting '${keyName}'`,
          searchTerm,
          setting_key: keyName,
          status_code: result.status_code
        };
      }
      
      const formattedResults = CompanySettingsClient.formatSearchResults(setting, searchResults, searchTerm);
      
      return {
        success: true,
        search_results: formattedResults,
        status_code: result.status_code
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search setting: ${error instanceof Error ? error.message : error}`,
        status_code: result.status_code
      };
    }
  } else {
    return result;
  }
}

