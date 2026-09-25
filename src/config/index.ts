/**
 * Configuration Management for PR-Pulse
 * Manages AWS SDK v3 credentials, endpoint URLs, and environment variables
 */

// Environment types
export type Environment = 'DEV' | 'STAGING' | 'PROD';

// Configuration interface
export interface Config {
  readonly environment: Environment;
  readonly jevApiKey: string;
  readonly jevEndpoint: string;
  readonly awsRegion: string;
  readonly digestWebhookUrl?: string;
  readonly databaseTableName: string;
  readonly rateLimitPerMinute: number;
  readonly logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

// Base configuration
const baseConfig: Config = {
  environment: getEnvironment(),
  jevApiKey: getRequiredEnv('JEV_API_KEY'),
  jevEndpoint: process.env.JEV_ENDPOINT || 'https://api.typesafe.ai/jev/v1/chat/completions',
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  digestWebhookUrl: process.env.DIGEST_WEBHOOK_URL,
  databaseTableName: process.env.DATABASE_TABLE_NAME || 'PRPulse-Cache-dev',
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10),
  logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || 'INFO',
};

/**
 * Get environment from NODE_ENV or default to DEV
 */
function getEnvironment(): Environment {
  const env = process.env.NODE_ENV?.toUpperCase();
  if (env === 'STAGING' || env === 'PROD' || env === 'DEV') {
    return env;
  }
  return 'DEV';
}

/**
 * Get required environment variable or throw error
 */
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Get AWS credentials configuration
 */
export function getAwsCredentials() {
  return {
    region: baseConfig.awsRegion,
  };
}

/**
 * Get API Gateway endpoint configuration
 */
export function getApiGatewayConfig() {
  const endpoint = process.env.API_GATEWAY_ENDPOINT;
  if (endpoint) {
    return { endpoint };
  }
  return {};
}

/**
 * Get full application configuration
 */
export function getConfig(): Config {
  return { ...baseConfig };
}

/**
 * Validate configuration
 */
export function validateConfig(config: Config): boolean {
  const errors: string[] = [];

  if (!config.jevApiKey) {
    errors.push('JEV_API_KEY is required');
  }

  if (!config.awsRegion) {
    errors.push('AWS_REGION is required');
  }

  if (config.rateLimitPerMinute <= 0) {
    errors.push('RATE_LIMIT_PER_MINUTE must be positive');
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:', errors);
    return false;
  }

  return true;
}

/**
 * Get log level priority for filtering
 */
export function getLogLevelPriority(level: Config['logLevel']): number {
  const priorities: Record<Config['logLevel'], number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };
  return priorities[level] || 1;
}

// Export for easy mocking in tests
export const _internal = {
  getEnvironment,
  getRequiredEnv,
};