import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErroresFilter } from './errores.filter.js';

/** Con solo importarlo, toda la aplicación responde sus errores con el formato estándar. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: ErroresFilter }],
})
export class ErroresModule {}
