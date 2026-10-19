import { readConfig } from './config';
import { PostgresStorage } from './storage';
import { hashPassword } from './password';
async function resetPassword() {
  const config = readConfig();
  const hash = await hashPassword(config.adminPassword);
  const storage = new PostgresStorage(config.databaseUrl);
  try {
    await storage.transaction(async (client) => {
      const user = (
        await client.query(
          'UPDATE studio_users SET password_hash=$2 WHERE username=$1 RETURNING id',
          [config.adminUsername, hash],
        )
      ).rows[0];
      if (!user) throw new Error('Account does not exist');
      await client.query('DELETE FROM studio_sessions WHERE user_id=$1', [user.id]);
    });
    process.stdout.write('Password changed; previous sessions revoked. Workspace data retained.\n');
  } finally {
    await storage.close();
  }
}
void resetPassword().catch(() => {
  process.stderr.write('Password reset failed. Check private configuration and account name.\n');
  process.exitCode = 1;
});
