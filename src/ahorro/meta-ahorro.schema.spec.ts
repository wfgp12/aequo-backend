import mongoose from 'mongoose';
import { TipoMeta } from './meta-ahorro.enums.js';
import { MetaAhorroSchema } from './meta-ahorro.schema.js';

// Paquete 4.1.1 (RF-21): el esquema de la meta de ahorro mensual, por porcentaje del ingreso propio o monto fijo.
describe('Esquema de Meta de ahorro', () => {
  const MetaAhorroModelo = mongoose.model('MetaAhorroSoloParaPruebas', MetaAhorroSchema);
  const nuevoId = () => new mongoose.Types.ObjectId();
  const datosValidos = (cambios: Record<string, unknown> = {}) => ({
    usuarioId: nuevoId(),
    tipoMeta: 'MONTO_FIJO',
    valorObjetivo: 300000,
    periodo: new Date('2026-11-01T00:00:00Z'),
    ...cambios,
  });
  const sin = (campo: string) => {
    const datos: Record<string, unknown> = datosValidos();
    delete datos[campo];
    return datos;
  };
  const camposConError = (datos: Record<string, unknown>) =>
    Object.keys(new MetaAhorroModelo(datos).validateSync()?.errors ?? {});
  const unicos = () => MetaAhorroSchema.indexes().filter(([, opciones]) => opciones?.unique);

  describe('forma del documento', () => {
    it('CA-RF21-01 acepta una meta de porcentaje válida y conserva sus valores', () => {
      const meta = new MetaAhorroModelo(datosValidos({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20 }));

      expect(meta.validateSync()).toBeUndefined();
      expect(meta.tipoMeta).toBe('PORCENTAJE');
      expect(meta.valorObjetivo).toBe(20);
      expect(meta.periodo).toEqual(new Date('2026-11-01T00:00:00Z'));
    });

    it('CA-RF21-02 acepta una meta de monto fijo válida y conserva sus valores', () => {
      const meta = new MetaAhorroModelo(datosValidos({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000 }));

      expect(meta.validateSync()).toBeUndefined();
      expect(meta.tipoMeta).toBe('MONTO_FIJO');
      expect(meta.valorObjetivo).toBe(300000);
      expect(meta.periodo).toEqual(new Date('2026-11-01T00:00:00Z'));
    });

    it('CA-RF21-03 guarda solo los campos del modelo: sin acumulado ni plazo', () => {
      const campos = Object.keys(MetaAhorroSchema.paths).filter(
        (campo) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(campo),
      );

      expect(campos.sort()).toEqual(['ahorroReal', 'periodo', 'tipoMeta', 'usuarioId', 'valorObjetivo']);
    });

    it('CA-RF21-04 usa la colección metasahorro y registra las fechas de creación y modificación', () => {
      expect(MetaAhorroSchema.get('collection')).toBe('metasahorro');
      expect(MetaAhorroSchema.get('timestamps')).toBe(true);
    });
  });

  describe('usuario dueño', () => {
    it('CA-RF21-05 usuarioId es un ObjectId que referencia a Usuario', () => {
      const campo = MetaAhorroSchema.path('usuarioId');

      expect(campo.instance).toBe('ObjectId');
      expect(campo.options.ref).toBe('Usuario');
    });

    it.each([undefined, null])('CA-RF21-06 rechaza una meta sin usuarioId (%s)', (valor) => {
      expect(camposConError(datosValidos({ usuarioId: valor }))).toEqual(['usuarioId']);
    });

    it('CA-RF21-07 rechaza un usuarioId que no es un id', () => {
      expect(camposConError(datosValidos({ usuarioId: 'no-es-un-id' }))).toEqual(['usuarioId']);
    });
  });

  describe('tipo de meta', () => {
    it('CA-RF21-08 acepta PORCENTAJE y MONTO_FIJO, y la enumeración tiene solo esos dos valores', () => {
      expect(Object.values(TipoMeta).sort()).toEqual(['MONTO_FIJO', 'PORCENTAJE']);
      expect(camposConError(datosValidos({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20 }))).toEqual([]);
      expect(camposConError(datosValidos({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000 }))).toEqual([]);
    });

    it.each(['OBJETIVO', 'porcentaje', ''])('CA-RF21-09 rechaza el tipo fuera de la enumeración (%j)', (tipoMeta) => {
      expect(camposConError(datosValidos({ tipoMeta }))).toEqual(['tipoMeta']);
    });

    it('CA-RF21-10 rechaza una meta sin tipo', () => {
      expect(camposConError(sin('tipoMeta'))).toEqual(['tipoMeta']);
    });
  });

  describe('valor de la meta', () => {
    it.each([undefined, null])('CA-RF21-11 rechaza una meta sin valorObjetivo (%s)', (valor) => {
      expect(camposConError(datosValidos({ valorObjetivo: valor }))).toEqual(['valorObjetivo']);
    });

    it('CA-RF21-12 rechaza un valorObjetivo que no es número', () => {
      expect(camposConError(datosValidos({ valorObjetivo: 'veinte' }))).toEqual(['valorObjetivo']);
    });

    it.each([
      ['PORCENTAJE', -1],
      ['MONTO_FIJO', -50000],
    ])('CA-RF21-13 rechaza un valor negativo (%s, %s)', (tipoMeta, valorObjetivo) => {
      expect(camposConError(datosValidos({ tipoMeta, valorObjetivo }))).toEqual(['valorObjetivo']);
    });

    it.each(['PORCENTAJE', 'MONTO_FIJO'])('CA-RF21-14 rechaza un valor en cero (%s)', (tipoMeta) => {
      expect(camposConError(datosValidos({ tipoMeta, valorObjetivo: 0 }))).toEqual(['valorObjetivo']);
    });

    it.each([0.5, 12.5, 20, 100])('CA-RF21-15 acepta el porcentaje %s', (valorObjetivo) => {
      expect(camposConError(datosValidos({ tipoMeta: 'PORCENTAJE', valorObjetivo }))).toEqual([]);
    });

    it.each([100.01, 150])('CA-RF21-15 rechaza el porcentaje %s por pasar de 100', (valorObjetivo) => {
      expect(camposConError(datosValidos({ tipoMeta: 'PORCENTAJE', valorObjetivo }))).toEqual(['valorObjetivo']);
    });

    it.each([1, 300000, 1500000.5, 999999999])('CA-RF21-16 acepta el monto fijo %s sin tope superior', (valorObjetivo) => {
      expect(camposConError(datosValidos({ tipoMeta: 'MONTO_FIJO', valorObjetivo }))).toEqual([]);
    });
  });

  describe('periodo mensual', () => {
    it.each([undefined, null])('CA-RF21-17 rechaza una meta sin periodo (%s)', (valor) => {
      expect(camposConError(datosValidos({ periodo: valor }))).toEqual(['periodo']);
    });

    it.each(['noviembre', '2026-13-45'])('CA-RF21-18 rechaza un periodo que no es una fecha (%s)', (periodo) => {
      expect(camposConError(datosValidos({ periodo }))).toEqual(['periodo']);
    });

    it.each(['noviembre', '2026-13-45'])('CA-RF21-27 el error de un periodo inválido conserva el valor enviado (%s)', (periodo) => {
      const error = new MetaAhorroModelo(datosValidos({ periodo })).validateSync()?.errors.periodo;

      expect(error?.message).toContain(`"${periodo}"`);
    });

    it.each(['2026-11-01T00:00:00Z', '2026-02-01T00:00:00Z'])(
      'CA-RF21-19 conserva tal cual el primer día del mes a las 00:00 UTC (%s)',
      (periodo) => {
        const meta = new MetaAhorroModelo(datosValidos({ periodo: new Date(periodo) }));

        expect(meta.validateSync()).toBeUndefined();
        expect(meta.periodo).toEqual(new Date(periodo));
      },
    );

    it.each([
      ['2026-11-15T18:30:00Z', '2026-11-01T00:00:00.000Z'],
      ['2026-11-30T23:59:59Z', '2026-11-01T00:00:00.000Z'],
      ['2026-12-31T23:59:59Z', '2026-12-01T00:00:00.000Z'],
    ])('CA-RF21-20 normaliza %s al primer día del mes: %s', (periodo, esperado) => {
      const meta = new MetaAhorroModelo(datosValidos({ periodo: new Date(periodo) }));

      expect(meta.validateSync()).toBeUndefined();
      expect(meta.periodo.toISOString()).toBe(esperado);
    });

    it.each(['2035-06-01T00:00:00Z', '2015-01-01T00:00:00Z'])('CA-RF21-21 acepta el periodo %s', (periodo) => {
      expect(camposConError(datosValidos({ periodo: new Date(periodo) }))).toEqual([]);
    });
  });

  describe('unicidad: una meta por usuario y periodo', () => {
    it('CA-RF21-22 declara un índice único sobre usuarioId y periodo, en ese orden', () => {
      const indice = unicos().find(([claves]) => 'usuarioId' in claves && 'periodo' in claves);

      expect(indice).toBeDefined();
      expect(Object.keys(indice![0])).toEqual(['usuarioId', 'periodo']);
    });

    it('CA-RF21-23 ese es el único índice único: no es solo por usuario, ni solo por periodo, ni incluye el tipo', () => {
      expect(unicos().map(([claves]) => Object.keys(claves))).toEqual([['usuarioId', 'periodo']]);
    });
  });

  describe('ahorro real del periodo', () => {
    it('CA-RF21-24 acepta un ahorroReal numérico y rechaza texto', () => {
      const meta = new MetaAhorroModelo(datosValidos({ ahorroReal: 150000 }));

      expect(meta.validateSync()).toBeUndefined();
      expect(meta.ahorroReal).toBe(150000);
      expect(camposConError(datosValidos({ ahorroReal: 'mucho' }))).toEqual(['ahorroReal']);
    });

    it('CA-RF21-25 ahorroReal es opcional y vale 0 al crear la meta', () => {
      const meta = new MetaAhorroModelo(datosValidos());

      expect(meta.validateSync()).toBeUndefined();
      expect(meta.ahorroReal).toBe(0);
    });

    it('CA-RF21-26 acepta un ahorroReal negativo', () => {
      const meta = new MetaAhorroModelo(datosValidos({ ahorroReal: -25000 }));

      expect(meta.validateSync()).toBeUndefined();
      expect(meta.ahorroReal).toBe(-25000);
    });
  });
});
