import { BadRequestException } from '@nestjs/common';

/** Al editar: al menos un campo y ninguno en null (a una tarjeta, cargo o compra no se le quita un dato). */
export function validarCuerpo(dto: object): Record<string, unknown> {
  const enviados = Object.entries(dto).filter(([, valor]) => valor !== undefined);
  const nulos = enviados.filter(([, valor]) => valor === null).map(([campo]) => `${campo} no puede ser null`);
  if (nulos.length > 0) throw new BadRequestException(nulos);
  if (enviados.length === 0) throw new BadRequestException(['Debes enviar al menos un campo para modificar']);
  return Object.fromEntries(enviados);
}
