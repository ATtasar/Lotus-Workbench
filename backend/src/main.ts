import { readConfig } from './config';
import { PostgresStorage } from './storage';
import { createApplication } from './app';
let startupStage = 'configuration';
let startupStorage: PostgresStorage | undefined;
async function main() {
  const config = readConfig();
  startupStage = 'database migration';
  const storage = (startupStorage = new PostgresStorage(config.databaseUrl));
  await storage.migrate();
  startupStage = 'account initialization';
  const app = await createApplication(storage, config);
  startupStage = 'HTTP listener';
  await app.listen(config.port, config.host);
  process.stdout.write(
    JSON.stringify({
      event: 'started',
      host: config.host,
      port: config.port,
      authenticationEnabled: !!config.publicOrigin,
    }) + '\n',
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await storage.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}
void main().catch(async (error: unknown) => {
  const candidate = (error as { code?: unknown })?.code;
  const code =
    typeof candidate === 'string' &&
    ['ECONNREFUSED', 'ETIMEDOUT', 'EADDRINUSE', '28P01', '3D000', '42501'].includes(candidate)
      ? candidate
      : 'STARTUP_FAILED';
  const advice: Record<string, string> = {
    ECONNREFUSED: 'Start the local PostgreSQL service and check its loopback port.',
    ETIMEDOUT: 'Check local PostgreSQL connectivity and service health.',
    EADDRINUSE: 'The API port is occupied. Do not terminate unrelated applications.',
    '28P01':
      'Database password mismatch. Keep the existing config; do not reset passwords automatically.',
    '3D000': 'Application database missing. Run the deployment database initialization step.',
    '42501': 'Application database permissions are insufficient. Check creator_app ownership.',
    STARTUP_FAILED:
      'Check the protected environment and database configuration; credentials are withheld.',
  };
  process.stderr.write(
    JSON.stringify({ event: 'startup_failed', stage: startupStage, code, advice: advice[code] }) +
      '\n',
  );
  await startupStorage?.close().catch(() => {});
  process.exitCode = 1;
});
