import { HttpExceptionFilter } from '@core/shared';
import { PayloadTooLargeException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

import type { AppConfig } from '../config/app.config';

const BODY_LIMIT = '100kb';
const API_PREFIX = 'api/v1';
// The compose healthcheck hits these two paths directly, with no prefix.
const PREFIX_EXCLUDED_PATHS = ['health', 'health/ready'];
const DOCS_PATH = 'docs';
const TRUST_PROXY_HOP_COUNT = 1;

/**
 * All the request-handling wiring the app needs before it can serve traffic.
 * Pulled out of `main.ts` into its own function so both the real entry point
 * and tests call the exact same code path, instead of this behavior being
 * verifiable only by reading source.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.use(helmet());
  app.enableCors({ origin: [...config.corsOrigins] });
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));
  // The body parsers above raise a raw Express error, not a Nest exception,
  // so without this translation it would fall through the shared filter's
  // generic 500 branch instead of a proper 413.
  app.use(translateBodyParserErrors);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  // Behind a load balancer, so the throttler and access logs key on the real
  // client IP (X-Forwarded-For) instead of the load balancer's.
  app.set('trust proxy', TRUST_PROXY_HOP_COUNT);
  app.setGlobalPrefix(API_PREFIX, { exclude: PREFIX_EXCLUDED_PATHS });

  if (!config.isProduction) {
    mountSwagger(app);
  }
}

/**
 * `SwaggerModule.setup` mounts directly on the underlying HTTP adapter, not
 * through Nest's router — it is never subject to `setGlobalPrefix`, so
 * `/docs` needs no exclude entry of its own.
 */
function mountSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Task Management Platform API')
      .setDescription('Generic workflow engine over pluggable task types')
      .setVersion('1.0')
      .build(),
  );

  SwaggerModule.setup(DOCS_PATH, app, document);
}

/**
 * `express`'s body parsers reject an oversized body with a plain `Error`
 * carrying `status: 413`, not one of Nest's exception classes — left alone,
 * the shared filter cannot recognize it and answers a generic 500. This is
 * an Express-level error-handling middleware (four parameters is how Express
 * identifies one), positioned right after the parsers so it only ever sees
 * their errors.
 */
function translateBodyParserErrors(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (isPayloadTooLarge(error)) {
    next(new PayloadTooLargeException('Request body exceeds the size limit'));
    return;
  }

  next(error);
}

function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 413
  );
}
