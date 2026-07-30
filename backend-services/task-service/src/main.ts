import 'reflect-metadata';

import { Logger } from '@core/shared';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './infrastructure/config/app.config';
import { loadEnvFile } from './infrastructure/config/load-env';
import { configureApp } from './infrastructure/http/configure-app';

async function bootstrap(): Promise<void> {
  // Bring the root `.env` into `process.env` before the config module parses
  // it; a no-op wherever the environment is already supplied (containers, CI).
  loadEnvFile();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // Resolved from the container the config module already built — the
  // factory in app-config.module.ts is the single place `process.env` gets
  // read, not this file too.
  const config = app.get<AppConfig>(APP_CONFIG);

  configureApp(app, config);
  app.enableShutdownHooks();

  await app.listen(config.port);

  new Logger('Bootstrap').info('Application started', {
    port: config.port,
    nodeEnv: config.nodeEnv,
  });
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error('Application failed to start', { error });
  process.exitCode = 1;
});
