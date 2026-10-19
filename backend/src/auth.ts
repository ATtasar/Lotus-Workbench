import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { hashPassword, verifyPassword } from './password';
import { emptyDatabase } from './workspace';
import type { Storage } from './storage';
import type { Config } from './config';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export class AuthService {
  private failures = new Map<string, { count: number; until: number }>();
  private dummyHash = '';
  constructor(
    private storage: Storage,
    private config: Config,
  ) {}
  async initialize() {
    this.dummyHash = await hashPassword(randomBytes(32).toString('hex'));
    const existing = (
      await this.storage.query('SELECT id FROM studio_users WHERE username=$1', [
        this.config.adminUsername,
      ])
    ).rows[0];
    if (!existing) {
      const hash = await hashPassword(this.config.adminPassword);
      await this.storage.transaction(async (client) => {
        const id = randomUUID();
        const inserted = await client.query(
          'INSERT INTO studio_users(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING id',
          [id, this.config.adminUsername, hash],
        );
        if (inserted.rows.length)
          await client.query('INSERT INTO studio_workspaces(user_id,data) VALUES($1,$2::jsonb)', [
            id,
            JSON.stringify(emptyDatabase(this.config.adminUsername)),
          ]);
      });
    }
    await this.storage.query('DELETE FROM studio_sessions WHERE expires_at < now()');
  }
  checkOrigin(req: Request) {
    if (
      !this.config.publicOrigin ||
      (this.config.production && !this.config.publicOrigin.startsWith('https://'))
    )
      throw new ServiceUnavailableException('请先配置正式域名和 HTTPS，再启用账号访问');
    if (!req.headers.origin || !this.config.origins.includes(req.headers.origin))
      throw new ForbiddenException('请求来源未授权');
  }
  private cookie(token: string, maxAge: number) {
    return `studio_session=${token}; Path=/api; HttpOnly; SameSite=${this.config.sameSite}; Max-Age=${maxAge}${this.config.secureCookies ? '; Secure' : ''}`;
  }
  async login(req: Request, res: Response, body: unknown) {
    this.checkOrigin(req);
    const input = body as { username?: unknown; password?: unknown } | null;
    if (
      !input ||
      typeof input.username !== 'string' ||
      typeof input.password !== 'string' ||
      input.username.length > 100 ||
      input.password.length > 1024
    )
      throw new UnauthorizedException('账号或密码错误');
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const failure = this.failures.get(key);
    if (failure && failure.until > Date.now() && failure.count >= 10)
      throw new HttpException('登录尝试过多，请 15 分钟后重试', 429);
    const user = (
      await this.storage.query(
        'SELECT id,username,password_hash FROM studio_users WHERE username=$1',
        [input.username],
      )
    ).rows[0];
    const valid = await verifyPassword(input.password, user?.password_hash || this.dummyHash);
    if (!user || !valid) {
      if (this.failures.size > 10000)
        for (const [ip, entry] of this.failures)
          if (entry.until <= Date.now()) this.failures.delete(ip);
      this.failures.set(key, {
        count: failure && failure.until > Date.now() ? failure.count + 1 : 1,
        until: Date.now() + 15 * 60 * 1000,
      });
      throw new UnauthorizedException('账号或密码错误');
    }
    this.failures.delete(key);
    const token = randomBytes(32).toString('hex');
    await this.storage.query(
      "INSERT INTO studio_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [digest(token), user.id],
    );
    res.setHeader('Set-Cookie', this.cookie(token, 7 * 86400));
    return { user: { id: user.id, username: user.username } };
  }
  private token(req: Request) {
    return /(?:^|;\s*)studio_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  }
  async user(req: Request) {
    const token = this.token(req);
    if (!token) throw new UnauthorizedException('请登录');
    const user = (
      await this.storage.query(
        'SELECT u.id,u.username FROM studio_sessions s JOIN studio_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
        [digest(token)],
      )
    ).rows[0];
    if (!user) throw new UnauthorizedException('登录已过期，请重新登录');
    return user as { id: string; username: string };
  }
  async logout(req: Request, res: Response) {
    this.checkOrigin(req);
    const token = this.token(req);
    if (token)
      await this.storage.query('DELETE FROM studio_sessions WHERE token_hash=$1', [digest(token)]);
    res.setHeader('Set-Cookie', this.cookie('', 0));
    return { ok: true };
  }
}
