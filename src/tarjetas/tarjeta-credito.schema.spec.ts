import mongoose from 'mongoose';
import { TarjetaCreditoSchema } from './tarjeta-credito.schema.js';

// Paquete 5.1.1 (RF-24): el esquema de la tarjeta de crédito.
describe('Esquema de Tarjeta de crédito', () => {
  const TarjetaModelo = mongoose.model(
    'TarjetaCreditoSoloParaPruebas',
    TarjetaCreditoSchema,
  );
  const nuevoId = () => new mongoose.Types.ObjectId();
  const datosValidos = (cambios: Record<string, unknown> = {}) => ({
    usuarioId: nuevoId(),
    nombre: 'Visa Bancolombia',
    tasaEA: 0.2921,
    cuotaUnicaSinInteres: true,
    ...cambios,
  });
  const camposConError = (datos: Record<string, unknown>) =>
    Object.keys(new TarjetaModelo(datos).validateSync()?.errors ?? {});
  const unicos = () =>
    TarjetaCreditoSchema.indexes().filter(([, opciones]) => opciones?.unique);

  describe('forma del documento', () => {
    it('CA-RF24-01 acepta una tarjeta válida y conserva sus valores', () => {
      const tarjeta = new TarjetaModelo(datosValidos());

      expect(tarjeta.validateSync()).toBeUndefined();
      expect(tarjeta.nombre).toBe('Visa Bancolombia');
      expect(tarjeta.tasaEA).toBe(0.2921);
      expect(tarjeta.cuotaUnicaSinInteres).toBe(true);
    });

    it('CA-RF24-02 guarda solo los campos del modelo: nada calculado', () => {
      const campos = Object.keys(TarjetaCreditoSchema.paths).filter(
        (campo) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(campo),
      );

      expect(campos.sort()).toEqual([
        'cuotaUnicaSinInteres',
        'nombre',
        'tasaEA',
        'usuarioId',
      ]);
    });

    it('CA-RF24-03 usa la colección tarjetas y registra las fechas de creación y modificación', () => {
      expect(TarjetaCreditoSchema.get('collection')).toBe('tarjetas');
      expect(TarjetaCreditoSchema.get('timestamps')).toBe(true);
    });
  });

  describe('usuario dueño', () => {
    it('CA-RF24-04 usuarioId es un ObjectId que referencia a Usuario', () => {
      const campo = TarjetaCreditoSchema.path('usuarioId');

      expect(campo.instance).toBe('ObjectId');
      expect(campo.options.ref).toBe('Usuario');
    });

    it.each([undefined, null])(
      'CA-RF24-05 rechaza una tarjeta sin usuarioId (%s)',
      (valor) => {
        expect(camposConError(datosValidos({ usuarioId: valor }))).toEqual([
          'usuarioId',
        ]);
      },
    );

    it('CA-RF24-06 rechaza un usuarioId que no es un id', () => {
      expect(
        camposConError(datosValidos({ usuarioId: 'no-es-un-id' })),
      ).toEqual(['usuarioId']);
    });
  });

  describe('nombre', () => {
    it.each([undefined, null, '', '   '])(
      'CA-RF24-07 rechaza una tarjeta sin nombre (%j)',
      (nombre) => {
        expect(camposConError(datosValidos({ nombre }))).toEqual(['nombre']);
      },
    );

    it('CA-RF24-08 guarda el nombre sin espacios sobrantes', () => {
      const tarjeta = new TarjetaModelo(
        datosValidos({ nombre: '  Visa Bancolombia  ' }),
      );

      expect(tarjeta.validateSync()).toBeUndefined();
      expect(tarjeta.nombre).toBe('Visa Bancolombia');
    });

    it('CA-RF24-09 acepta un nombre de 50 caracteres y rechaza uno de 51', () => {
      expect(camposConError(datosValidos({ nombre: 'a'.repeat(50) }))).toEqual(
        [],
      );
      expect(camposConError(datosValidos({ nombre: 'a'.repeat(51) }))).toEqual([
        'nombre',
      ]);
    });
  });

  describe('tasa efectiva anual', () => {
    it.each([undefined, null])(
      'CA-RF24-10 rechaza una tarjeta sin tasaEA (%s)',
      (tasaEA) => {
        expect(camposConError(datosValidos({ tasaEA }))).toEqual(['tasaEA']);
      },
    );

    it('CA-RF24-11 rechaza una tasaEA que no es número', () => {
      expect(camposConError(datosValidos({ tasaEA: 'alta' }))).toEqual([
        'tasaEA',
      ]);
    });

    it('CA-RF24-12 acepta la tasa 0', () => {
      const tarjeta = new TarjetaModelo(datosValidos({ tasaEA: 0 }));

      expect(tarjeta.validateSync()).toBeUndefined();
      expect(tarjeta.tasaEA).toBe(0);
    });

    it.each([0.0001, 0.2921, 1])('CA-RF24-13 acepta la tasa %s', (tasaEA) => {
      expect(camposConError(datosValidos({ tasaEA }))).toEqual([]);
    });

    it.each([-0.01, 1.0001, 29.21])(
      'CA-RF24-13 rechaza la tasa %s',
      (tasaEA) => {
        expect(camposConError(datosValidos({ tasaEA }))).toEqual(['tasaEA']);
      },
    );
  });

  describe('cuota única sin interés', () => {
    it('CA-RF24-14 cuotaUnicaSinInteres vale false si no se indica', () => {
      const datos: Record<string, unknown> = datosValidos();
      delete datos.cuotaUnicaSinInteres;
      const tarjeta = new TarjetaModelo(datos);

      expect(tarjeta.validateSync()).toBeUndefined();
      expect(tarjeta.cuotaUnicaSinInteres).toBe(false);
    });

    it.each([true, false])(
      'CA-RF24-15 acepta cuotaUnicaSinInteres %s y lo conserva',
      (valor) => {
        const tarjeta = new TarjetaModelo(
          datosValidos({ cuotaUnicaSinInteres: valor }),
        );

        expect(tarjeta.validateSync()).toBeUndefined();
        expect(tarjeta.cuotaUnicaSinInteres).toBe(valor);
      },
    );

    it('CA-RF24-15 rechaza un cuotaUnicaSinInteres que no es lógico', () => {
      expect(
        camposConError(datosValidos({ cuotaUnicaSinInteres: 'quizás' })),
      ).toEqual(['cuotaUnicaSinInteres']);
    });
  });

  describe('índices', () => {
    it('CA-RF24-16 el único índice único es (usuarioId, nombre) y no distingue mayúsculas', () => {
      expect(unicos().map(([claves]) => Object.keys(claves))).toEqual([
        ['usuarioId', 'nombre'],
      ]);
      expect([1, 2]).toContain(unicos()[0][1]?.collation?.strength);
    });
  });
});
