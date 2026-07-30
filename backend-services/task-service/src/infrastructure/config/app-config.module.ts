import { Global, Module } from '@nestjs/common';

import { APP_CONFIG, type AppConfig, loadAppConfig } from './app.config';

/**
 * Global so every feature module can inject `APP_CONFIG` without re-importing
 * this module — mirrors the single-parse-point rule: one factory call per
 * process, one typed object handed around after that.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadAppConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
