/// <reference types="vite/client" />
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { construirConfigSwagger } from './swagger.js';

// Estándar de documentación: esta prueba descubre TODOS los controladores del proyecto y falla si algún
// endpoint o DTO nuevo queda sin documentar (un endpoint sin decorar no aparece en Swagger sin avisar).
const modulos = import.meta.glob('../**/*.controller.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;
const controladores = Object.values(modulos)
  .flatMap((exportado) => Object.values(exportado))
  .filter(
    (valor): valor is new (...args: never[]) => unknown =>
      typeof valor === 'function' && Reflect.getMetadata('path', valor) !== undefined,
  );

const operaciones = (documento: OpenAPIObject) =>
  Object.entries(documento.paths).flatMap(([ruta, metodos]) =>
    Object.entries(metodos).map(([metodo, op]) => ({
      nombre: `${metodo.toUpperCase()} ${ruta}`,
      op: op as {
        tags?: string[];
        summary?: string;
        description?: string;
        parameters?: Array<{ in?: string; name?: string }>;
        responses: Record<string, { description?: string }>;
      },
    })),
  );

describe('Documentación Swagger', () => {
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

  it('descubre controladores y publica endpoints', () => {
    expect(controladores.length).toBeGreaterThan(0);
    expect(operaciones(documento).length).toBeGreaterThan(0);
  });

  it('cada endpoint tiene etiqueta, resumen y una descripción detallada', () => {
    for (const { nombre, op } of operaciones(documento)) {
      expect(op.tags?.length, `${nombre}: falta @ApiTags`).toBeGreaterThan(0);
      expect(op.summary?.trim(), `${nombre}: falta summary en @ApiOperation`).toBeTruthy();
      expect(
        (op.description ?? '').length,
        `${nombre}: la description de @ApiOperation es muy corta (mínimo 80 caracteres)`,
      ).toBeGreaterThanOrEqual(80);
    }
  });

  it('cada endpoint documenta su respuesta exitosa y al menos un error, todas con descripción', () => {
    for (const { nombre, op } of operaciones(documento)) {
      const codigos = Object.keys(op.responses);
      expect(codigos.some((c) => c.startsWith('2')), `${nombre}: falta respuesta 2xx`).toBe(true);
      expect(codigos.some((c) => !c.startsWith('2')), `${nombre}: falta documentar algún error (4xx/5xx)`).toBe(true);
      for (const [codigo, respuesta] of Object.entries(op.responses)) {
        expect(
          (respuesta.description ?? '').length,
          `${nombre} ${codigo}: falta description en la respuesta`,
        ).toBeGreaterThan(15);
      }
    }
  });

  it('cada propiedad de cada DTO tiene descripción y ejemplo', () => {
    const esquemas = documento.components?.schemas ?? {};
    for (const [esquema, definicion] of Object.entries(esquemas)) {
      const propiedades = ('properties' in definicion ? definicion.properties : {}) ?? {};
      for (const [propiedad, datos] of Object.entries(propiedades)) {
        const d = datos as { description?: string; example?: unknown; $ref?: string; allOf?: unknown[]; items?: { $ref?: string } };
        // Un $ref apunta a otro DTO, que ya se valida por su cuenta; solo exigimos descripción.
        expect(d.description?.trim(), `${esquema}.${propiedad}: falta description en @ApiProperty`).toBeTruthy();
        if (!d.$ref && !d.allOf && !d.items?.$ref) {
          expect(d.example, `${esquema}.${propiedad}: falta example en @ApiProperty`).toBeDefined();
        }
      }
    }
  });

  it('cada petición que crea datos (POST con respuesta 201) documenta el header Idempotency-Key', () => {
    for (const { nombre, op } of operaciones(documento)) {
      if (nombre.startsWith('POST') && op.responses['201']) {
        const tieneHeader = op.parameters?.some((p) => p.in === 'header' && p.name === 'Idempotency-Key');

        expect(tieneHeader, `${nombre}: falta @Idempotente() (deduplicación de peticiones)`).toBe(true);
      }
    }
  });
});
