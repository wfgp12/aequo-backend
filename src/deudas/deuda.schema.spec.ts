import mongoose from 'mongoose';
import { DeudaSchema } from './deuda.schema.js';

// Paquete 6.1.1 (RF-34, RF-36): el esquema de la deuda.
describe('Esquema de Deuda', () => {
  const DeudaModelo = mongoose.model('DeudaSoloParaPruebas', DeudaSchema);
  const nuevoId = () => new mongoose.Types.ObjectId();
  const datosValidos = (cambios: Record<string, unknown> = {}) => ({
    usuarioId: nuevoId(),
    acreedor: 'Juan Pérez',
    ...cambios,
  });
  const camposConError = (datos: Record<string, unknown>) =>
    Object.keys(new DeudaModelo(datos).validateSync()?.errors ?? {});

  describe('forma del documento', () => {
    it('CA-RF34-01 acepta una deuda válida y conserva sus valores', () => {
      const datos = datosValidos();
      const deuda = new DeudaModelo(datos);

      expect(deuda.validateSync()).toBeUndefined();
      expect(String(deuda.usuarioId)).toBe(String(datos.usuarioId));
      expect(deuda.acreedor).toBe('Juan Pérez');
      expect(deuda.tipoInteres).toBe('SIN_INTERES');
      expect(deuda.valorInteres).toBe(0);
      expect(deuda.saldada).toBe(false);
    });

    it('CA-RF34-02 no guarda montos calculables: solo los campos del modelo', () => {
      const campos = Object.keys(DeudaSchema.paths).filter(
        (campo) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(campo),
      );
      const deMas = {
        monto: 500000,
        montoPrestado: 500000,
        abonado: 100000,
        saldo: 400000,
        intereses: 10000,
        fecha: '2026-11-26',
      };
      const documento = new DeudaModelo(datosValidos(deMas)).toObject();

      expect(campos.sort()).toEqual([
        'acreedor',
        'saldada',
        'tipoInteres',
        'usuarioId',
        'valorInteres',
      ]);
      for (const campo of Object.keys(deMas)) {
        expect(documento).not.toHaveProperty(campo);
      }
    });

    it('CA-RF34-03 usa la colección deudas y registra las fechas de creación y modificación', () => {
      expect(DeudaSchema.get('collection')).toBe('deudas');
      expect(DeudaSchema.get('timestamps')).toBe(true);
    });
  });

  describe('usuario dueño', () => {
    it('CA-RF34-04 usuarioId es un ObjectId que referencia a Usuario', () => {
      const campo = DeudaSchema.path('usuarioId');

      expect(campo.instance).toBe('ObjectId');
      expect(campo.options.ref).toBe('Usuario');
    });

    it.each([undefined, null, 'no-es-un-id'])(
      'CA-RF34-05 rechaza una deuda sin usuarioId o con uno que no es un id (%j)',
      (usuarioId) => {
        expect(camposConError(datosValidos({ usuarioId }))).toEqual([
          'usuarioId',
        ]);
      },
    );
  });

  describe('acreedor', () => {
    it.each([undefined, null, '', '   '])(
      'CA-RF34-06 rechaza una deuda sin acreedor (%j)',
      (acreedor) => {
        expect(camposConError(datosValidos({ acreedor }))).toEqual([
          'acreedor',
        ]);
      },
    );

    it('CA-RF34-06 guarda el acreedor sin espacios sobrantes', () => {
      const deuda = new DeudaModelo(
        datosValidos({ acreedor: '  Juan Pérez  ' }),
      );

      expect(deuda.validateSync()).toBeUndefined();
      expect(deuda.acreedor).toBe('Juan Pérez');
    });

    it('CA-RF34-07 acepta 50 caracteres (también rodeados de espacios) y rechaza 51', () => {
      expect(
        camposConError(datosValidos({ acreedor: 'a'.repeat(50) })),
      ).toEqual([]);
      expect(
        camposConError(datosValidos({ acreedor: `  ${'a'.repeat(50)}  ` })),
      ).toEqual([]);
      expect(
        camposConError(datosValidos({ acreedor: 'a'.repeat(51) })),
      ).toEqual(['acreedor']);
    });
  });

  describe('estado', () => {
    it('CA-RF34-08 saldada vale false si no se indica y acepta true', () => {
      const sinIndicar = new DeudaModelo(datosValidos());
      const saldada = new DeudaModelo(datosValidos({ saldada: true }));

      expect(sinIndicar.saldada).toBe(false);
      expect(saldada.validateSync()).toBeUndefined();
      expect(saldada.saldada).toBe(true);
    });

    it.each([null, 'quizás'])(
      'CA-RF34-08 rechaza saldada %j',
      (saldada) => {
        expect(camposConError(datosValidos({ saldada }))).toEqual(['saldada']);
      },
    );
  });

  describe('índices', () => {
    it('CA-RF34-09 hay un índice no único por usuarioId', () => {
      const porUsuario = DeudaSchema.indexes().filter(
        ([campos, opciones]) =>
          Object.keys(campos).join() === 'usuarioId' && !opciones?.unique,
      );

      expect(porUsuario).toHaveLength(1);
      expect(porUsuario[0][0]).toEqual({ usuarioId: 1 });
    });

    it('CA-RF34-10 el único índice único permite una sola deuda activa por usuario y acreedor, sin distinguir mayúsculas', () => {
      const unicos = DeudaSchema.indexes().filter(
        ([, opciones]) => opciones?.unique,
      );

      expect(unicos).toHaveLength(1);
      const [campos, opciones] = unicos[0];
      expect(Object.entries(campos)).toEqual([
        ['usuarioId', 1],
        ['acreedor', 1],
      ]);
      expect(opciones?.partialFilterExpression).toEqual({ saldada: false });
      expect(opciones?.collation).toEqual({ locale: 'es', strength: 2 });
    });
  });

  describe('tipo de interés (RF-36)', () => {
    it.each([
      ['SIN_INTERES', 0],
      ['TASA', 0.02],
      ['MONTO_FIJO', 150000],
    ])(
      'CA-RF36-01 acepta %s con el valor %s y los conserva',
      (tipoInteres, valorInteres) => {
        const deuda = new DeudaModelo(
          datosValidos({ tipoInteres, valorInteres }),
        );

        expect(deuda.validateSync()).toBeUndefined();
        expect(deuda.tipoInteres).toBe(tipoInteres);
        expect(deuda.valorInteres).toBe(valorInteres);
      },
    );

    it('CA-RF36-02 sin indicar interés la deuda es sin intereses y de valor 0', () => {
      const deuda = new DeudaModelo(datosValidos());

      expect(deuda.validateSync()).toBeUndefined();
      expect(deuda.tipoInteres).toBe('SIN_INTERES');
      expect(deuda.valorInteres).toBe(0);
    });

    it('CA-RF36-03 la enumeración tiene exactamente SIN_INTERES, TASA y MONTO_FIJO', () => {
      const valores = [
        ...(
          DeudaSchema.path('tipoInteres') as unknown as {
            enumValues: string[];
          }
        ).enumValues,
      ];

      expect(valores.sort()).toEqual(['MONTO_FIJO', 'SIN_INTERES', 'TASA']);
    });

    it.each(['PRESTAMO', 'tasa', '', null, 1])(
      'CA-RF36-03 rechaza el tipo de interés %j',
      (tipoInteres) => {
        expect(camposConError(datosValidos({ tipoInteres }))).toContain(
          'tipoInteres',
        );
      },
    );

    it.each([0.02, 150000, -1])(
      'CA-RF36-04 sin intereses rechaza el valor %s',
      (valorInteres) => {
        expect(
          camposConError(
            datosValidos({ tipoInteres: 'SIN_INTERES', valorInteres }),
          ),
        ).toEqual(['valorInteres']);
      },
    );

    it('CA-RF36-04 sin indicar el tipo rechaza un valor distinto de 0', () => {
      expect(camposConError(datosValidos({ valorInteres: 0.02 }))).toEqual([
        'valorInteres',
      ]);
    });

    it.each([0.0001, 1])('CA-RF36-05 acepta la tasa %s', (valorInteres) => {
      const deuda = new DeudaModelo(
        datosValidos({ tipoInteres: 'TASA', valorInteres }),
      );

      expect(deuda.validateSync()).toBeUndefined();
      expect(deuda.valorInteres).toBe(valorInteres);
    });

    it.each([0, -0.02, 1.01, 2])(
      'CA-RF36-05 rechaza la tasa %s (debe ser mayor que 0 y hasta 1)',
      (valorInteres) => {
        expect(
          camposConError(datosValidos({ tipoInteres: 'TASA', valorInteres })),
        ).toEqual(['valorInteres']);
      },
    );

    it.each(['TASA', 'MONTO_FIJO'])(
      'CA-RF36-06 %s sin valor se rechaza',
      (tipoInteres) => {
        expect(camposConError(datosValidos({ tipoInteres }))).toEqual([
          'valorInteres',
        ]);
      },
    );

    it.each([0.01, 150000.5, 25000000])(
      'CA-RF36-07 acepta el monto fijo %s sin redondear',
      (valorInteres) => {
        const deuda = new DeudaModelo(
          datosValidos({ tipoInteres: 'MONTO_FIJO', valorInteres }),
        );

        expect(deuda.validateSync()).toBeUndefined();
        expect(deuda.valorInteres).toBe(valorInteres);
      },
    );

    it.each([0, -1])(
      'CA-RF36-07 rechaza el monto fijo %s',
      (valorInteres) => {
        expect(
          camposConError(
            datosValidos({ tipoInteres: 'MONTO_FIJO', valorInteres }),
          ),
        ).toEqual(['valorInteres']);
      },
    );

    describe.each(['SIN_INTERES', 'TASA', 'MONTO_FIJO'])(
      'valor no finito con %s',
      (tipoInteres) => {
        it.each([null, 'abc', Number.POSITIVE_INFINITY])(
          'CA-RF36-08 rechaza el valor %s',
          (valorInteres) => {
            expect(
              camposConError(datosValidos({ tipoInteres, valorInteres })),
            ).toEqual(['valorInteres']);
          },
        );
      },
    );

    it.each([
      ['TASA', 0.02, 'SIN_INTERES', 0],
      ['MONTO_FIJO', 150000, 'TASA', 0.02],
    ])(
      'CA-RF36-09 en una deuda guardada con %s %s, cambiar solo el tipo a %s se rechaza',
      async (tipoGuardado, valorGuardado, tipoNuevo, valorNuevo) => {
        // `hydrate` reproduce un documento leído de la base: ningún campo está modificado.
        const guardada = () =>
          DeudaModelo.hydrate({
            _id: nuevoId(),
            ...datosValidos({
              tipoInteres: tipoGuardado,
              valorInteres: valorGuardado,
              saldada: false,
            }),
          });
        const erroresAl = (deuda: ReturnType<typeof guardada>) =>
          deuda.validate().then(
            () => [],
            (error: mongoose.Error.ValidationError) =>
              Object.keys(error.errors),
          );

        const soloTipo = guardada();
        soloTipo.set('tipoInteres', tipoNuevo);
        const tipoYValor = guardada();
        tipoYValor.set({ tipoInteres: tipoNuevo, valorInteres: valorNuevo });

        expect(await erroresAl(soloTipo)).toEqual(['valorInteres']);
        expect(await erroresAl(tipoYValor)).toEqual([]);
      },
    );
  });
});
