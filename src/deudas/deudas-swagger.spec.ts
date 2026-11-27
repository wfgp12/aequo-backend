/// <reference types="vite/client" />
import { type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { construirConfigSwagger } from '../common/swagger.js';
import { ReportesController } from '../reportes/reportes.controller.js';

// Paquete 6.1.2: `src/common/swagger.spec.ts` revisa que lo que exista esté documentado, pero no puede saber qué debe
// existir. Los controladores del módulo se descubren, así esta prueba falla por lo que falta y no por un import.
const modulos = import.meta.glob('./*.controller.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const controladores = Object.values(modulos)
  .flatMap((exportado) => Object.values(exportado))
  .filter(
    (valor): valor is new (...args: never[]) => unknown =>
      typeof valor === 'function' && Reflect.getMetadata('path', valor) !== undefined,
  );

interface Operacion {
  tags?: string[];
  description?: string;
  parameters?: Array<{ in?: string; name?: string }>;
  responses: Record<string, unknown>;
}

describe('Swagger de las deudas y los préstamos', () => {
  let documento: OpenAPIObject;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ controllers: [...controladores, ReportesController] })
      .useMocker(() => ({}))
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    await app.init();
    documento = SwaggerModule.createDocument(app, construirConfigSwagger());
    await app.close();
  });

  const operacion = (metodo: 'get' | 'post' | 'delete', ruta: string) =>
    documento.paths[ruta]?.[metodo] as Operacion | undefined;

  it.each([
    ['post', '/deudas/prestamos', ['201', '400', '401', '409', '422', '500']],
    ['get', '/deudas', ['200', '401', '500']],
    ['delete', '/deudas/{deudaId}/prestamos/{prestamoId}', ['204', '400', '401', '404', '409', '500']],
  ] as const)('CA-RF34-33 documenta %s %s con la etiqueta deudas y sus respuestas', (metodo, ruta, codigos) => {
    const op = operacion(metodo, ruta);

    expect(op, `${metodo.toUpperCase()} ${ruta} no está documentado`).toBeDefined();
    expect(op?.tags).toContain('deudas');
    expect(op?.description?.length ?? 0).toBeGreaterThanOrEqual(80);
    expect(Object.keys(op?.responses ?? {})).toEqual(expect.arrayContaining([...codigos]));
  });

  it('CA-RF34-33 la etiqueta deudas tiene descripción general', () => {
    const etiqueta = documento.tags?.find((tag) => tag.name === 'deudas');

    expect(etiqueta?.description?.trim()).toBeTruthy();
  });

  it('CA-RF34-33 el POST documenta Idempotency-Key y los seis campos del cuerpo', () => {
    const op = operacion('post', '/deudas/prestamos') as (Operacion & { requestBody?: any }) | undefined;

    expect(op?.parameters?.some((p) => p.in === 'header' && p.name === 'Idempotency-Key')).toBe(true);
    const ref: string | undefined = op?.requestBody?.content?.['application/json']?.schema?.$ref;
    const esquema = documento.components?.schemas?.[ref?.split('/').pop() ?? ''] as
      | { properties?: Record<string, unknown> }
      | undefined;
    expect(Object.keys(esquema?.properties ?? {}).sort()).toEqual([
      'acreedor',
      'descripcion',
      'fecha',
      'monto',
      'tipoInteres',
      'valorInteres',
    ]);
  });

  it('CA-RF34-33 el GET documenta la respuesta como un objeto con el arreglo items', () => {
    const op = operacion('get', '/deudas') as { responses: Record<string, any> } | undefined;
    // El esquema puede ir en línea (como en los demás listados) o en un DTO propio.
    let esquema: any = op?.responses['200']?.content?.['application/json']?.schema;
    if (esquema?.$ref) esquema = documento.components?.schemas?.[esquema.$ref.split('/').pop()];

    expect(esquema?.properties?.items?.type).toBe('array');
  });

  it('CA-RF34-16 el resumen del periodo documenta dineroDisponible', () => {
    const esquema = documento.components?.schemas?.PeriodoRespuestaDto as {
      properties?: Record<string, { description?: string; example?: unknown }>;
    };
    const campo = esquema.properties?.dineroDisponible;

    expect(campo?.description?.trim()).toBeTruthy();
    expect(campo?.example).toBeDefined();
  });
});
