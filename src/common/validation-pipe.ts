import { ValidationPipe } from '@nestjs/common';

/** Contrato estricto: un campo que el DTO no declara se rechaza con 400 en vez de ignorarse. */
export const crearValidationPipe = () =>
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
