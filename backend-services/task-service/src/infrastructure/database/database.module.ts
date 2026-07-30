import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { buildReadDataSourceOptions, buildWriteDataSourceOptions } from './typeorm.config';

export const READ_CONNECTION = 'read';

/**
 * Two named connections from day one: the default
 * connection is the write DataSource, `READ_CONNECTION` the lag-tolerant one.
 * Both resolve to the same URL until `DB_READ_URL` is set.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => buildWriteDataSourceOptions(config.database),
    }),
    TypeOrmModule.forRootAsync({
      name: READ_CONNECTION,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => buildReadDataSourceOptions(config.database),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
