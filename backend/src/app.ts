import 'reflect-metadata';
import {
  Body,
  Catch,
  Controller,
  Get,
  HttpException,
  Module,
  Post,
  Req,
  Res,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type Request, type Response } from 'express';
import { appendFileSync, mkdirSync, existsSync, statSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from './config';
import type { Storage } from './storage';
import { AuthService } from './auth';
import { WorkspaceService } from './workspace';
import type { Changes } from '../../src/data/changeSet';

export async function createApplication(storage: Storage, config: Config) {
  const auth = new AuthService(storage, config);
  await auth.initialize();
  const workspace = new WorkspaceService(storage);
  if (config.logDir) mkdirSync(config.logDir, { recursive: true });
  const log = (entry: Record<string, unknown>) => {
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
    process.stdout.write(line + '\n');
    if (config.logDir)
      try {
        const file = join(config.logDir, `api-${new Date().toISOString().slice(0, 10)}.jsonl`);
        if (existsSync(file) && statSync(file).size > 10 * 1024 * 1024) {
          if (existsSync(file + '.1')) rmSync(file + '.1');
          renameSync(file, file + '.1');
        }
        appendFileSync(file, line + '\n');
      } catch {
        process.stderr.write('{"event":"log_write_failed"}\n');
      }
  };
  @Controller('api')
  class ApiController {
    @Get('health/live') live() {
      return { status: 'ok' };
    }
    @Get('health/ready') async ready() {
      await storage.query('SELECT 1');
      return { status: 'ok', database: 'ok', release: config.releaseId };
    }
    @Post('auth/login') login(
      @Req() req: Request,
      @Res({ passthrough: true }) res: Response,
      @Body() body: unknown,
    ) {
      return auth.login(req, res, body);
    }
    @Get('auth/session') async session(@Req() req: Request) {
      return { user: await auth.user(req) };
    }
    @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
      return auth.logout(req, res);
    }
    @Get('workspace') async load(@Req() req: Request) {
      return workspace.load((await auth.user(req)).id);
    }
    @Post('workspace/changesets') async save(
      @Req() req: Request,
      @Body() body: { baseRevision: number; requestId: string; changes: Changes },
    ) {
      auth.checkOrigin(req);
      return workspace.save((await auth.user(req)).id, body);
    }
  }
  @Module({ controllers: [ApiController] })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use((req: Request, res: Response, next: () => void) => {
    const id = randomUUID();
    const started = Date.now();
    const path = req.originalUrl.split('?')[0].slice(0, 256);
    res.setHeader('X-Request-Id', id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () =>
      log({
        event: 'request',
        id,
        method: req.method,
        path,
        status: res.statusCode,
        ms: Date.now() - started,
      }),
    );
    next();
  });
  app.enableCors({
    origin: (origin: string | undefined, done: (error: Error | null, allowed?: boolean) => void) =>
      done(null, !!origin && config.origins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });
  app.use('/api/auth', express.json({ limit: '16kb', strict: true }));
  app.use('/api/workspace', async (req: Request, res: Response, next: () => void) => {
    try {
      if (req.method !== 'GET') auth.checkOrigin(req);
      await auth.user(req);
      next();
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      res
        .status(status)
        .json({ message: error instanceof HttpException ? error.message : '服务暂时不可用' });
    }
  });
  app.use('/api/workspace', express.json({ limit: '140mb', strict: true }));
  @Catch()
  class SafeErrors implements ExceptionFilter {
    catch(error: unknown, host: ArgumentsHost) {
      const res = host.switchToHttp().getResponse<Response>();
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : (error as { status?: number })?.status === 413
            ? 413
            : (error as { type?: string })?.type === 'entity.parse.failed'
              ? 400
              : 500;
      const response = error instanceof HttpException ? error.getResponse() : null;
      const message =
        typeof response === 'string'
          ? response
          : response && typeof response === 'object' && 'message' in response
            ? response.message
            : status === 413
              ? '请求数据过大'
              : status === 400
                ? 'JSON 格式无效'
                : '服务暂时不可用';
      if (status >= 500)
        log({ event: 'server_error', name: error instanceof Error ? error.name : 'UnknownError' });
      res.status(status).json({ statusCode: status, message });
    }
  }
  app.useGlobalFilters(new SafeErrors());
  return app;
}
