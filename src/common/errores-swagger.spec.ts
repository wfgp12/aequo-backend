/// <reference types="vite/client" />
import { type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { construirConfigSwagger } from './swagger.js';

// Paquete 8.3.8: Swagger documenta `code` y `action` en cada respuesta de error y la descripción general, el catálogo.
const modulos = import.meta.glob('../**/*.controller.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const controladores = Object.values(modulos)
  .flatMap((exportado) => Object.values(exportado))
  .filter(
    (valor): valor is new (...args: never[]) => unknown =>
      typeof valor === 'function' && Reflect.getMetadata('path', valor) !== undefined,
  );

const CATALOGO = [
  'VALIDACION',
  'SESION_INVALIDA',
  'TOKEN_GOOGLE_INVALIDO',
  'RUTA_NO_ENCONTRADA',
  'ERROR_HTTP',
  'ERROR_INTERNO',
  'CATEGORIA_NO_ENCONTRADA',
  'TRANSACCION_NO_ENCONTRADA',
  'META_NO_ENCONTRADA',
  'TARJETA_NO_ENCONTRADA',
  'CARGO_NO_ENCONTRADO',
  'COMPRA_NO_ENCONTRADA',
  'PAGO_NO_ENCONTRADO',
  'DEUDA_NO_ENCONTRADA',
  'PRESTAMO_NO_ENCONTRADO',
  'CATEGORIA_PREDETERMINADA',
  'CATEGORIA_DUPLICADA',
  'META_DUPLICADA',
  'META_CON_AHORRO',
  'TARJETA_DUPLICADA',
  'TARJETA_CON_COMPRAS',
  'TARJETA_CON_PAGOS',
  'TRANSACCION_DE_OTRO_MODULO',
  'DEUDA_INTERES_DISTINTO',
  'DEUDA_REGISTRO_SIMULTANEO',
  'DEUDA_CON_ABONOS',
  'IDEMPOTENCIA_EN_PROCESO',
  'IDEMPOTENCIA_CLAVE_REUTILIZADA',
];

type Esquema = {
  $ref?: string;
  required?: string[];
  properties?: Record<string, { description?: string; example?: unknown }>;
};

describe('Swagger de las respuestas de error', () => {
  let documento: OpenAPIObject;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ controllers: controladores })
      .useMocker(() => ({}))
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    await app.init();
    documento = SwaggerModule.createDocument(app, construirConfigSwagger());
    await app.close();
  });

  /** Lo que le falta al esquema de una respuesta de error. */
  const faltantes = (respuesta: { content?: Record<string, { schema?: Esquema }> }): string[] => {
    let esquema = respuesta.content?.['application/json']?.schema;
    if (esquema?.$ref) esquema = documento.components?.schemas?.[esquema.$ref.split('/').pop() ?? ''] as Esquema;
    if (!esquema?.properties) return ['el esquema'];
    const { properties, required = [] } = esquema;
    const faltan = ['statusCode', 'error', 'message', 'code', 'action'].filter((nombre) => !properties[nombre]);
    for (const nombre of ['code', 'action']) {
      const propiedad = properties[nombre];
      if (propiedad && !propiedad.description?.trim()) faltan.push(`description de ${nombre}`);
      if (propiedad && propiedad.example === undefined) faltan.push(`example de ${nombre}`);
    }
    if (properties.code && !required.includes('code')) faltan.push('code obligatorio');
    if (required.includes('action')) faltan.push('action opcional');
    return faltan;
  };

  it('CA-ERR-11 cada respuesta de error documenta statusCode, error, message, code y action', () => {
    const errores = Object.entries(documento.paths).flatMap(([ruta, metodos]) =>
      Object.entries(metodos).flatMap(([metodo, operacion]) =>
        Object.entries((operacion as { responses: Record<string, object> }).responses)
          .filter(([codigo]) => !codigo.startsWith('2'))
          .map(([codigo, respuesta]) => ({ nombre: `${metodo.toUpperCase()} ${ruta} ${codigo}`, respuesta })),
      ),
    );

    expect(errores.length).toBeGreaterThan(0);
    const incompletas = errores
      .map(({ nombre, respuesta }) => ({ nombre, faltan: faltantes(respuesta) }))
      .filter(({ faltan }) => faltan.length > 0)
      .map(({ nombre, faltan }) => `${nombre}: ${faltan.join(', ')}`);
    expect(incompletas).toEqual([]);
  });

  it.each(['code', 'action', ...CATALOGO])('CA-ERR-12 la descripción general menciona %s', (texto) => {
    expect(documento.info.description).toMatch(new RegExp(`\\b${texto}\\b`));
  });
});
