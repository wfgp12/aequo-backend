import { applyDecorators } from '@nestjs/common';
import { IsISO8601, isISO8601, Matches, ValidateBy } from 'class-validator';

/**
 * Una fecha de calendario `YYYY-MM-DD`, sin hora ni zona horaria (así no hay desfases entre cliente y servidor), y
 * que sea un día real (el 30 de febrero no existe). Los mensajes empiezan por el nombre del campo.
 */
export const FechaCalendario = (campo: string) =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: `${campo} debe tener el formato YYYY-MM-DD` }),
    IsISO8601({ strict: true }, { message: `${campo} debe ser una fecha real del calendario (YYYY-MM-DD)` }),
  );

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Un mes de calendario `YYYY-MM` (mes de 01 a 12). El mensaje empieza por el nombre del campo. */
export const MesCalendario = (campo: string) =>
  Matches(MES, { message: `${campo} debe tener el formato YYYY-MM con un mes de 01 a 12` });

/**
 * Un mes expresado como `YYYY-MM` o como una fecha real `YYYY-MM-DD` (sin hora): lo que importa es el mes y el día
 * se descarta. El mensaje empieza por el nombre del campo.
 */
export const MesOFechaCalendario = (campo: string) =>
  ValidateBy({
    name: 'mesOFechaCalendario',
    validator: {
      validate: (valor: unknown) =>
        typeof valor === 'string' &&
        (MES.test(valor) || (/^\d{4}-\d{2}-\d{2}$/.test(valor) && isISO8601(valor, { strict: true }))),
      defaultMessage: () => `${campo} debe tener el formato YYYY-MM (o una fecha real YYYY-MM-DD)`,
    },
  });
