// Note: dotenv is loaded in index.ts before this module is imported

export interface Config {
  tokens: {
    pd: string;
    in: string;
    ac: string;
  };
  defaultEnvironment: string;
  timeout: number;
  baseUrls: {
    pd: string;
    in: string;
    ac: string;
  };
}

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set. Please check your .env file.`);
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function getOptionalEnvVarNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number, got: ${value}`);
  }
  return parsed;
}

export function loadConfig(): Config {
  try {
    // Support both old single token format and new separate tokens per environment
    let tokens: { pd: string; in: string; ac: string };
    
    // Check if environment-specific tokens are provided
    const pdToken = process.env['TP_SETTINGS_TOKEN_PD'];
    const inToken = process.env['TP_SETTINGS_TOKEN_IN'];
    const acToken = process.env['TP_SETTINGS_TOKEN_AC'];
    
    if (pdToken || inToken || acToken) {
      // New format: separate tokens per environment
      tokens = {
        pd: pdToken || getRequiredEnvVar('TP_SETTINGS_TOKEN_PD'),
        in: inToken || getRequiredEnvVar('TP_SETTINGS_TOKEN_IN'),
        ac: acToken || getRequiredEnvVar('TP_SETTINGS_TOKEN_AC')
      };
    } else {
      // Fallback to old format: single token for all environments
      const singleToken = getRequiredEnvVar('TP_SETTINGS_TOKEN');
      tokens = {
        pd: singleToken,
        in: singleToken,
        ac: singleToken
      };
    }

    const config: Config = {
      tokens,
      defaultEnvironment: getOptionalEnvVar('TP_SETTINGS_DEFAULT_ENV', 'pd'),
      timeout: getOptionalEnvVarNumber('TP_SETTINGS_TIMEOUT', 30000),
      baseUrls: {
        pd: getOptionalEnvVar('TP_SETTINGS_BASE_PD', 'http://tpadmin.pd.tp.nil/api/internal/v1'),
        in: getOptionalEnvVar('TP_SETTINGS_BASE_IN', 'http://tpadmin.in.tp.nil/api/internal/v1'),
        ac: getOptionalEnvVar('TP_SETTINGS_BASE_AC', 'http://tpadmin.ac.tp.nil/api/internal/v1'),
      }
    };

    // Validate token format (basic validation)
    Object.entries(config.tokens).forEach(([env, token]) => {
      if (token.length < 10) {
        throw new Error(`TP_SETTINGS_TOKEN_${env.toUpperCase()} appears to be invalid (too short). Please check your token.`);
      }
    });

    // Validate environment
    if (!['pd', 'in', 'ac'].includes(config.defaultEnvironment)) {
      throw new Error(`TP_SETTINGS_DEFAULT_ENV must be one of: pd, in, ac. Got: ${config.defaultEnvironment}`);
    }

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Configuration error: ${error.message}`);
    }
    throw new Error('Unknown configuration error');
  }
}

export async function validateToken(config: Config): Promise<boolean> {
  try {
    const axios = (await import('axios')).default;
    
    // Test the token for the default environment
    const defaultEnv = config.defaultEnvironment as keyof typeof config.baseUrls;
    const testUrl = `${config.baseUrls[defaultEnv]}/setting/company/1`;
    const token = config.tokens[defaultEnv];
    
    const response = await axios.get(testUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: config.timeout,
      validateStatus: (status) => status < 500 // Accept 400s as valid auth, but not 500s
    });

    // If we get 401/403, token is invalid
    if (response.status === 401 || response.status === 403) {
      return false;
    }

    // Any other response (including 404, 400, 200) suggests the token is valid
    return true;
  } catch (error) {
    // Network errors or timeouts - we can't validate but assume token might be OK
    console.warn('Warning: Could not validate token due to network error. Proceeding anyway.');
    return true;
  }
}
