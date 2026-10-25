import { ValidationPipe } from '@nestjs/common';

/**
 * Contrato estricto: un campo que el DTO no declara se rechaza con 400 en vez de ignorarse. Con `transform` el
 * controlador recibe el DTO ya convertido (números de la query como número, nombres sin espacios en los extremos).
 */
export const crearValidationPipe = () =>
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
