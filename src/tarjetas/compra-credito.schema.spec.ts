import mongoose from 'mongoose';
import { CompraCreditoSchema } from './compra-credito.schema.js';

// Paquete 5.2.1 (RF-26, RF-28): el esquema de la compra con tarjeta de crédito y del avance en efectivo.
describe('Esquema de Compra con tarjeta de crédito', () => {
  const CompraModelo = mongoose.model(
    'CompraCreditoSoloParaPruebas',
    CompraCreditoSchema,
  );
  const nuevoId = () => new mongoose.Types.ObjectId();
  const datosValidos = (cambios: Record<string, unknown> = {}) => ({
    usuarioId: nuevoId(),
    tarjetaId: nuevoId(),
    categoriaId: nuevoId(),
    descripcion: 'Televisor',
    valor: 1254700,
    cuotas: 12,
    fecha: '2026-11-10T15:00:00.000Z',
    primerPago: '2026-12-01T00:00:00.000Z',
    tasaEAAplicada: 0.2921,
    cuotaUnicaSinInteres: false,
    ...cambios,
  });
  const sin = (campo: string) => datosValidos({ [campo]: undefined });
  const camposConError = (datos: Record<string, unknown>) =>
    Object.keys(new CompraModelo(datos).validateSync()?.errors ?? {});
  const indices = () => CompraCreditoSchema.indexes();

  describe('forma del documento', () => {
    it('CA-RF26-01 acepta una compra válida y conserva sus valores', () => {
      const datos = datosValidos();
      const compra = new CompraModelo(datos);

      expect(compra.validateSync()).toBeUndefined();
      expect(String(compra.usuarioId)).toBe(String(datos.usuarioId));
      expect(String(compra.tarjetaId)).toBe(String(datos.tarjetaId));
      expect(String(compra.categoriaId)).toBe(String(datos.categoriaId));
      expect(compra.descripcion).toBe('Televisor');
      expect(compra.valor).toBe(1254700);
      expect(compra.cuotas).toBe(12);
      expect(compra.fecha.toISOString()).toBe('2026-11-10T15:00:00.000Z');
      expect(compra.primerPago.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(compra.tasaEAAplicada).toBe(0.2921);
      expect(compra.cuotaUnicaSinInteres).toBe(false);
      expect(compra.tipo).toBe('COMPRA');
    });

    // Modificado en 5.2.3 (D12, aprobado el 2026-11-13): la lista incluye `transaccionId`, el enlace del avance con su transacción.
    it('CA-RF26-02 guarda solo los campos del modelo (más transaccionId): nada calculado', () => {
      const campos = Object.keys(CompraCreditoSchema.paths).filter(
        (campo) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(campo),
      );

      expect(campos.sort()).toEqual([
        'categoriaId',
        'cuotaUnicaSinInteres',
        'cuotas',
        'descripcion',
        'fecha',
        'primerPago',
        'tarjetaId',
        'tasaEAAplicada',
        'tipo',
        'transaccionId',
        'usuarioId',
        'valor',
      ]);
    });

    it('CA-RF26-03 usa la colección comprascredito y registra las fechas de creación y modificación', () => {
      expect(CompraCreditoSchema.get('collection')).toBe('comprascredito');
      expect(CompraCreditoSchema.get('timestamps')).toBe(true);
    });
  });

  describe('usuario, tarjeta y categoría', () => {
    it('CA-RF26-04 usuarioId es un ObjectId que referencia a Usuario', () => {
      const campo = CompraCreditoSchema.path('usuarioId');

      expect(campo.instance).toBe('ObjectId');
      expect(campo.options.ref).toBe('Usuario');
    });

    it.each([undefined, null, 'no-es-un-id'])(
      'CA-RF26-05 rechaza una compra sin usuarioId o con uno que no es un id (%j)',
      (valor) => {
        expect(camposConError(datosValidos({ usuarioId: valor }))).toEqual([
          'usuarioId',
        ]);
      },
    );

    it('CA-RF26-06 tarjetaId es un ObjectId que referencia a TarjetaCredito', () => {
      const campo = CompraCreditoSchema.path('tarjetaId');

      expect(campo.instance).toBe('ObjectId');
      expect(campo.options.ref).toBe('TarjetaCredito');
    });

    it.each([undefined, null, 'no-es-un-id'])(
      'CA-RF26-07 rechaza una compra sin tarjetaId o con uno que no es un id (%j)',
      (valor) => {
        expect(camposConError(datosValidos({ tarjetaId: valor }))).toEqual([
          'tarjetaId',
        ]);
      },
    );

    it('CA-RF26-08 categoriaId es un ObjectId que referencia a Categoria', () => {
      const campo = CompraCreditoSchema.path('categoriaId');

      expect(campo.instance).toBe('ObjectId');
      expect(campo.options.ref).toBe('Categoria');
    });

    it.each([undefined, null, 'no-es-un-id'])(
      'CA-RF26-09 rechaza una compra sin categoriaId o con uno que no es un id (%j)',
      (valor) => {
        expect(camposConError(datosValidos({ categoriaId: valor }))).toEqual([
          'categoriaId',
        ]);
      },
    );
  });

  describe('descripción', () => {
    it.each([undefined, null, '', '   '])(
      'CA-RF26-10 rechaza una compra sin descripción (%j)',
      (descripcion) => {
        expect(camposConError(datosValidos({ descripcion }))).toEqual([
          'descripcion',
        ]);
      },
    );

    it('CA-RF26-11 guarda la descripción sin espacios sobrantes', () => {
      const compra = new CompraModelo(
        datosValidos({ descripcion: '  Televisor  ' }),
      );

      expect(compra.validateSync()).toBeUndefined();
      expect(compra.descripcion).toBe('Televisor');
    });

    it('CA-RF26-12 acepta una descripción de 200 caracteres y rechaza una de 201', () => {
      expect(
        camposConError(datosValidos({ descripcion: 'a'.repeat(200) })),
      ).toEqual([]);
      expect(
        camposConError(datosValidos({ descripcion: 'a'.repeat(201) })),
      ).toEqual(['descripcion']);
    });
  });

  describe('valor', () => {
    it.each([undefined, null, 'caro'])(
      'CA-RF26-13 rechaza una compra con valor ausente o no numérico (%j)',
      (valor) => {
        expect(camposConError(datosValidos({ valor }))).toEqual(['valor']);
      },
    );

    it.each([0, -1254700])(
      'CA-RF26-14 rechaza un valor en cero o negativo (%s)',
      (valor) => {
        expect(camposConError(datosValidos({ valor }))).toEqual(['valor']);
      },
    );

    it.each([1, 1254700, 1500000.5, 999999999])(
      'CA-RF26-15 acepta el valor %s sin tope superior y sin redondear',
      (valor) => {
        const compra = new CompraModelo(datosValidos({ valor }));

        expect(compra.validateSync()).toBeUndefined();
        expect(compra.valor).toBe(valor);
      },
    );
  });

  describe('número de cuotas', () => {
    it.each([undefined, null, 'doce'])(
      'CA-RF26-16 rechaza una compra con cuotas ausentes o no numéricas (%j)',
      (cuotas) => {
        expect(camposConError(datosValidos({ cuotas }))).toEqual(['cuotas']);
      },
    );

    it.each([1, 12, 60])('CA-RF26-17 acepta %s cuotas', (cuotas) => {
      const compra = new CompraModelo(datosValidos({ cuotas }));

      expect(compra.validateSync()).toBeUndefined();
      expect(compra.cuotas).toBe(cuotas);
    });

    it.each([0, -1, 12.5, 61])(
      'CA-RF26-18 rechaza %s cuotas (cero, negativas, no enteras o sobre el máximo)',
      (cuotas) => {
        expect(camposConError(datosValidos({ cuotas }))).toEqual(['cuotas']);
      },
    );
  });

  describe('fechas', () => {
    it.each([undefined, null, 'ayer'])(
      'CA-RF26-19 rechaza una compra sin fecha o con una que no es fecha (%j)',
      (fecha) => {
        expect(camposConError(datosValidos({ fecha }))).toEqual(['fecha']);
      },
    );

    it.each([
      '2026-11-10T15:00:00.000Z',
      '2020-01-31T23:59:59.000Z',
      '2030-06-15T00:00:00.000Z',
    ])(
      'CA-RF26-20 guarda la fecha de compra %s tal cual, sin llevarla al día 1 ni a medianoche',
      (fecha) => {
        const compra = new CompraModelo(datosValidos({ fecha }));

        expect(compra.validateSync()).toBeUndefined();
        expect(compra.fecha.toISOString()).toBe(new Date(fecha).toISOString());
      },
    );

    it.each([undefined, null, 'pronto'])(
      'CA-RF26-21 rechaza una compra sin mes del primer pago o con uno que no es fecha (%j)',
      (primerPago) => {
        expect(camposConError(datosValidos({ primerPago }))).toEqual([
          'primerPago',
        ]);
      },
    );

    it.each([
      ['2026-12-15T10:30:00.000Z', '2026-12-01T00:00:00.000Z'],
      ['2026-01-31T23:59:59.000Z', '2026-01-01T00:00:00.000Z'],
      ['2026-02-28T12:00:00.000Z', '2026-02-01T00:00:00.000Z'],
      ['2026-12-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'],
      ['2026-03-20', '2026-03-01T00:00:00.000Z'],
    ])(
      'CA-RF26-22 guarda el primer pago %s como el día 1 de su mes a las 00:00 UTC (%s)',
      (entrada, esperado) => {
        const compra = new CompraModelo(datosValidos({ primerPago: entrada }));

        expect(compra.validateSync()).toBeUndefined();
        expect(compra.primerPago.toISOString()).toBe(esperado);
      },
    );

    it.each([
      ['el mismo mes', '2026-11-20T00:00:00.000Z'],
      ['el mes siguiente', '2026-12-01T00:00:00.000Z'],
      ['un mes anterior', '2026-10-15T00:00:00.000Z'],
    ])(
      'CA-RF26-23 no compara el primer pago con la fecha de compra (%s)',
      (_caso, primerPago) => {
        const datos = datosValidos({
          fecha: '2026-11-10T15:00:00.000Z',
          primerPago,
        });

        expect(new CompraModelo(datos).validateSync()).toBeUndefined();
      },
    );
  });

  describe('tasa y bandera copiadas de la tarjeta', () => {
    it.each([undefined, null, 'alta'])(
      'CA-RF26-24 rechaza una compra sin tasa aplicada o con una que no es número (%j)',
      (tasaEAAplicada) => {
        expect(camposConError(datosValidos({ tasaEAAplicada }))).toEqual([
          'tasaEAAplicada',
        ]);
      },
    );

    it.each([0, 0.0001, 0.2921, 1])(
      'CA-RF26-25 acepta la tasa aplicada %s sin redondear',
      (tasaEAAplicada) => {
        const compra = new CompraModelo(datosValidos({ tasaEAAplicada }));

        expect(compra.validateSync()).toBeUndefined();
        expect(compra.tasaEAAplicada).toBe(tasaEAAplicada);
      },
    );

    it.each([-0.01, 1.0001, 29.21])(
      'CA-RF26-25 rechaza la tasa aplicada %s (fuera de 0 a 1)',
      (tasaEAAplicada) => {
        expect(camposConError(datosValidos({ tasaEAAplicada }))).toEqual([
          'tasaEAAplicada',
        ]);
      },
    );

    it.each([undefined, null, 'quizás'])(
      'CA-RF26-26 rechaza una compra sin cuotaUnicaSinInteres o con uno que no es lógico (%j)',
      (cuotaUnicaSinInteres) => {
        expect(camposConError(datosValidos({ cuotaUnicaSinInteres }))).toEqual([
          'cuotaUnicaSinInteres',
        ]);
      },
    );

    it.each([true, false])(
      'CA-RF26-27 acepta cuotaUnicaSinInteres %s y lo conserva',
      (cuotaUnicaSinInteres) => {
        const compra = new CompraModelo(datosValidos({ cuotaUnicaSinInteres }));

        expect(compra.validateSync()).toBeUndefined();
        expect(compra.cuotaUnicaSinInteres).toBe(cuotaUnicaSinInteres);
      },
    );
  });

  describe('índices', () => {
    it('CA-RF26-28 hay un índice por usuario que incluye la fecha y otro por tarjeta', () => {
      const claves = indices().map(([campos]) => Object.keys(campos));

      expect(
        claves.some(
          (campos) => campos[0] === 'usuarioId' && campos.includes('fecha'),
        ),
      ).toBe(true);
      expect(claves.some((campos) => campos[0] === 'tarjetaId')).toBe(true);
    });

    it('CA-RF26-29 ningún índice es único: dos compras iguales son legítimas', () => {
      const unicos = indices().filter(([, opciones]) => opciones?.unique);

      expect(unicos).toEqual([]);
    });
  });

  describe('avances en efectivo (RF-28)', () => {
    it('CA-RF28-01 acepta un avance válido y conserva su tipo', () => {
      const compra = new CompraModelo(
        datosValidos({
          tipo: 'AVANCE',
          descripcion: 'Avance en efectivo',
          valor: 500000,
          cuotas: 6,
        }),
      );

      expect(compra.validateSync()).toBeUndefined();
      expect(compra.tipo).toBe('AVANCE');
      expect(compra.descripcion).toBe('Avance en efectivo');
      expect(compra.valor).toBe(500000);
      expect(compra.cuotas).toBe(6);
      expect(compra.tasaEAAplicada).toBe(0.2921);
      expect(compra.cuotaUnicaSinInteres).toBe(false);
    });

    it('CA-RF28-02 el tipo vale COMPRA si no se indica', () => {
      const compra = new CompraModelo(datosValidos());

      expect(compra.validateSync()).toBeUndefined();
      expect(compra.tipo).toBe('COMPRA');
    });

    it.each(['PRESTAMO', 'avance', '', null, 1])(
      'CA-RF28-03 rechaza el tipo %j',
      (tipo) => {
        expect(camposConError(datosValidos({ tipo }))).toEqual(['tipo']);
      },
    );

    it('CA-RF28-04 la enumeración del tipo tiene exactamente COMPRA y AVANCE', () => {
      const valores = [
        ...(
          CompraCreditoSchema.path('tipo') as unknown as {
            enumValues: string[];
          }
        ).enumValues,
      ];

      expect(valores.sort()).toEqual(['AVANCE', 'COMPRA']);
    });

    it.each([
      'categoriaId',
      'cuotas',
      'primerPago',
      'tasaEAAplicada',
      'cuotaUnicaSinInteres',
    ])(
      'CA-RF28-05 un avance sin %s se rechaza con error solo en ese campo',
      (campo) => {
        expect(camposConError({ ...sin(campo), tipo: 'AVANCE' })).toEqual([
          campo,
        ]);
      },
    );

    describe('transaccionId: el enlace del avance con su transacción (5.2.3)', () => {
      it('CA-RF28-25 es un ObjectId opcional que referencia a Transaccion y no tiene valor por defecto', () => {
        const campo = CompraCreditoSchema.path('transaccionId');

        expect(campo.instance).toBe('ObjectId');
        expect(campo.options.ref).toBe('Transaccion');
        expect(campo.isRequired).toBeFalsy();
        expect(campo.options.default).toBeUndefined();
      });

      it('CA-RF28-25 sin transaccionId o con un id válido pasa la validación, y sin él el documento no tiene el campo', () => {
        const sinEnlace = new CompraModelo(datosValidos());
        const idDeTransaccion = nuevoId();
        const conEnlace = new CompraModelo(
          datosValidos({ tipo: 'AVANCE', transaccionId: idDeTransaccion }),
        );

        expect(sinEnlace.validateSync()).toBeUndefined();
        expect(sinEnlace.transaccionId).toBeUndefined();
        expect(sinEnlace.toObject()).not.toHaveProperty('transaccionId');
        expect(conEnlace.validateSync()).toBeUndefined();
        expect(String(conEnlace.transaccionId)).toBe(String(idDeTransaccion));
      });

      it('CA-RF28-25 un transaccionId que no es un id falla con error solo en ese campo', () => {
        expect(
          camposConError(
            datosValidos({ tipo: 'AVANCE', transaccionId: 'no-es-un-id' }),
          ),
        ).toEqual(['transaccionId']);
      });
    });
  });
});
