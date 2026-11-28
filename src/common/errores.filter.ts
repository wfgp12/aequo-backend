import { STATUS_CODES } from 'node:http';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Inject, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ACCIONES, codigoDeExcepcion, type CodigoError } from './errores.catalogo.js';

/** El de la excepción de Nest o el 4xx del lector del cuerpo (marcado con `expose`); cualquier otra cosa es un 500. */
function estadoDe(excepcion: unknown): number {
  if (excepcion instanceof HttpException) return excepcion.getStatus();
  const { expose, statusCode } = (excepcion ?? {}) as { expose?: boolean; statusCode?: number };
  return expose && statusCode ? statusCode : 500;
}

function mensajeDe(excepcion: unknown): string | string[] {
  if (!(excepcion instanceof HttpException)) return (excepcion as Error).message;
  const respuesta = excepcion.getResponse();
  return typeof respuesta === 'string' ? respuesta : (respuesta as { message: string | string[] }).message;
}

/** El código con el que se lanzó la excepción o, en los errores genéricos, el que corresponde a su forma. */
function codigoDe(excepcion: unknown, status: number, esValidacion: boolean, hayRuta: boolean): CodigoError {
  const marcado = codigoDeExcepcion(excepcion);
  if (marcado) return marcado;
  if (status === 400 && esValidacion) return 'VALIDACION';
  if (status === 404 && !hayRuta) return 'RUTA_NO_ENCONTRADA';
  return 'ERROR_HTTP';
}

/** Una `action` sin valor no llega al cliente: JSON omite la propiedad. */
function armarCuerpo(excepcion: unknown, status: number, hayRuta: boolean) {
  // En un 5xx nada de la excepción sale en la respuesta: podría traer datos internos.
  const interno = status >= 500;
  const message = interno ? 'Internal server error' : mensajeDe(excepcion);
  const code = interno ? 'ERROR_INTERNO' : codigoDe(excepcion, status, Array.isArray(message), hayRuta);
  return { statusCode: status, error: STATUS_CODES[interno ? 500 : status], message, code, action: ACCIONES[code] };
}

/** Da a toda respuesta de error la forma `{ statusCode, error, message, code, action? }`. */
@Catch()
export class ErroresFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErroresFilter.name);

  constructor(@Inject(HttpAdapterHost) private readonly adaptador: HttpAdapterHost) {}

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const status = estadoDe(excepcion);
    if (status >= 500) this.logger.error(excepcion);
    // Sin `route`, el 404 es de Express: ninguna ruta ni método coincidió.
    const hayRuta = Boolean(http.getRequest<{ route?: unknown }>().route);
    this.adaptador.httpAdapter.reply(http.getResponse(), armarCuerpo(excepcion, status, hayRuta), status);
  }
}
