import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { construirConfigSwagger } from '../common/swagger.js';
import { TarjetasController } from './tarjetas.controller.js';

type Propiedad = {
  description?: string;
  example?: unknown;
  $ref?: string;
  items?: { $ref?: string };
};
type Esquema = { properties?: Record<string, Propiedad> };

// Paquete 5.3.6 (RF-31): el campo nuevo `detalle` debe quedar documentado. `src/common/swagger.spec.ts` revisa que toda
// propiedad que exista tenga descripción y ejemplo, pero no puede saber que `detalle` debe existir: esta prueba sí.
describe('Swagger del detalle por compra de la proyección', () => {
  let documento: OpenAPIObject;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [TarjetasController],
    })
      .useMocker(() => ({}))
      .compile();
    const app = modulo.createNestApplication({ logger: false });
    await app.init();
    documento = SwaggerModule.createDocument(app, construirConfigSwagger());
    await app.close();
  });

  const esquema = (nombre: string) =>
    documento.components?.schemas?.[nombre] as Esquema;

  const nombreDelRef = (ref?: string) => ref?.split('/').pop() as string;

  it('CA-RF31-17 el esquema de la respuesta documenta `detalle` y el elemento documenta sus seis campos', () => {
    const detalle = esquema('ProyeccionRespuestaDto').properties?.detalle;

    expect(detalle, 'ProyeccionRespuestaDto.detalle no está documentado').toBeDefined();
    expect(detalle?.description?.trim()).toBeTruthy();
    expect(detalle?.example).toBeDefined();
    const elemento = esquema(nombreDelRef(detalle?.items?.$ref));
    expect(elemento, 'el elemento del detalle no es un esquema propio').toBeDefined();
    expect(Object.keys(elemento.properties ?? {}).sort()).toEqual([
      'compraId',
      'cuota',
      'descripcion',
      'numeroCuota',
      'tipo',
      'totalCuotas',
    ]);
    for (const [nombre, propiedad] of Object.entries(elemento.properties ?? {})) {
      expect(propiedad.description?.trim(), `${nombre}: falta description`).toBeTruthy();
      expect(propiedad.example, `${nombre}: falta example`).toBeDefined();
    }
  });

  it('CA-RF31-18 las filas de la proyección no documentan `detalle`', () => {
    expect(esquema('MesProyeccionDto').properties).not.toHaveProperty('detalle');
  });

  it('la descripción de la ruta explica el detalle y la de la etiqueta `tarjetas` lo menciona', () => {
    const operacion = (
      documento.paths['/tarjetas/{tarjetaId}/proyeccion'] as {
        get: { description?: string };
      }
    ).get;
    const descripcion = operacion.description ?? '';

    expect(descripcion).toContain('detalle');
    for (const idea of ['numeroCuota', 'compraId', 'cargos fijos'])
      expect(descripcion).toContain(idea);
    const etiqueta = documento.tags?.find((t) => t.name === 'tarjetas');
    expect(etiqueta?.description ?? '').toContain('detalle');
  });
});
