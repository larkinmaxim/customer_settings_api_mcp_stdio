export enum SettingEnvironment {
  PD = "pd",
  IN = "in", 
  AC = "ac"
}

export enum SettingType {
  APPLICATION = "APPLICATION",
  COMPANY = "COMPANY",
  SCHEDULING_UNIT = "SCHEDULING_UNIT",
  USER = "USER"
}

export interface Setting {
  setting_uuid: string;
  type: SettingType;
  key: string;
  value: string;
  encoded: boolean;
  encrypted: boolean;
  owner: number;
  revision: number;
  deleted: boolean;
  created: string;
  modified: string;
}

export interface SettingsResponse {
  settings: {
    setting: Setting[];
  };
}

export interface RequestResult {
  success: boolean;
  response?: any;
  error?: string;
  status_code?: number;
  response_text?: string;
  environment?: string;
  base_url?: string;
  token_preview?: string;
}

export interface ListSettingsArgs {
  companyId: number;
  environment?: SettingEnvironment | 'pd' | 'in' | 'ac';
  keyName?: string;
  type?: SettingType;
  owner?: number;
  childObject?: number;
}

export interface GetSettingArgs {
  companyId: number;
  keyName: string;
  environment?: SettingEnvironment | 'pd' | 'in' | 'ac';
  type?: SettingType;
  owner?: number;
  childObject?: number;
  limit?: number;
  offset?: number;
}

export interface SearchInSettingArgs {
  companyId: number;
  keyName: string;
  searchTerm: string;
  environment?: SettingEnvironment | 'pd' | 'in' | 'ac';
  type?: SettingType;
  owner?: number;
  childObject?: number;
  contextLines?: number;
}
