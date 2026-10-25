import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/**
 * Una fecha de calendario `YYYY-MM-DD`, sin hora ni zona horaria (así no hay desfases entre cliente y servidor), y
 * que sea un día real (el 30 de febrero no existe). Los mensajes empiezan por el nombre del campo.
 */
export const FechaCalendario = (campo: string) =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: `${campo} debe tener el formato YYYY-MM-DD` }),
    IsISO8601({ strict: true }, { message: `${campo} debe ser una fecha real del calendario (YYYY-MM-DD)` }),
  );
