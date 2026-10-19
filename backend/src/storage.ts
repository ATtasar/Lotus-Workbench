import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export interface SqlClient {
  query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}
export interface Storage extends SqlClient {
  transaction<T>(fn: (client: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export class PostgresStorage implements Storage {
  private pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
    });
  }
  query(sql: string, values?: any[]) {
    return this.pool.query(sql, values);
  }
  async transaction<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async migrate() {
    await this.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(71423001)');
      await c.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
    });
  }
  close() {
    return this.pool.end();
  }
}
