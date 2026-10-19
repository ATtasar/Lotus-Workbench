export interface Config {
  production: boolean;
  host: string;
  port: number;
  databaseUrl: string;
  publicOrigin: string;
  origins: string[];
  adminUsername: string;
  adminPassword: string;
  secureCookies: boolean;
  sameSite: 'Lax' | 'None';
  logDir: string;
  releaseId: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const publicOrigin = (env.PUBLIC_ORIGIN || '').replace(/\/$/, '');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin)
    throw new Error('PUBLIC_ORIGIN must be an origin without a path');
  const secureCookies = production || publicOrigin.startsWith('https://');
  const origins = [
    ...new Set(
      [publicOrigin, ...(env.CORS_ORIGINS || '').split(',').map((x) => x.trim())].filter(Boolean),
    ),
  ];
  if (origins.some((x) => x === '*' || new URL(x).origin !== x))
    throw new Error('CORS_ORIGINS must contain exact origins');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {
    production,
    host: env.HOST || '127.0.0.1',
    port,
    databaseUrl: env.DATABASE_URL,
    publicOrigin,
    origins,
    adminUsername: env.ADMIN_USERNAME || 'creator',
    adminPassword: env.ADMIN_PASSWORD || '',
    secureCookies,
    sameSite: env.COOKIE_SAME_SITE === 'None' ? 'None' : 'Lax',
    logDir: env.LOG_DIR || '',
    releaseId: env.STUDIO_RELEASE_ID || 'local',
  };
}
