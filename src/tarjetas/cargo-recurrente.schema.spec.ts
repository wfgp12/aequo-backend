import mongoose from 'mongoose';
import { CargoRecurrenteSchema } from './cargo-recurrente.schema.js';

// Paquete 5.1.1 (RF-29): el esquema del cargo fijo mensual asociado a una tarjeta.
describe('Esquema de Cargo recurrente', () => {
  const CargoModelo = mongoose.model(
    'CargoRecurrenteSoloParaPruebas',
    CargoRecurrenteSchema,
  );
  const nuevoId = () => new mongoose.Types.ObjectId();
  const datosValidos = (cambios: Record<string, unknown> = {}) => ({
    usuarioId: nuevoId(),
    tarjetaId: nuevoId(),
    descripcion: 'Netflix',
    valor: 38900,
    activo: true,
    ...cambios,
  });
  const sin = (campo: string) => {
    const datos: Record<string, unknown> = datosValidos();
    delete datos[campo];
    return datos;
  };
  const camposConError = (datos: Record<string, unknown>) =>
    Object.keys(new CargoModelo(datos).validateSync()?.errors ?? {});
  const primerasClaves = () =>
    CargoRecurrenteSchema.indexes().map(([claves]) => Object.keys(claves)[0]);

  describe('forma del documento', () => {
    it('CA-RF29-01 acepta un cargo válido y conserva sus valores', () => {
      const cargo = new CargoModelo(datosValidos());

      expect(cargo.validateSync()).toBeUndefined();
      expect(cargo.descripcion).toBe('Netflix');
      expect(cargo.valor).toBe(38900);
      expect(cargo.activo).toBe(true);
    });

    it('CA-RF29-02 guarda solo los campos del modelo: sin día de cobro ni acumulados', () => {
      const campos = Object.keys(CargoRecurrenteSchema.paths).filter(
        (campo) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(campo),
      );

      expect(campos.sort()).toEqual([
        'activo',
        'descripcion',
        'tarjetaId',
        'usuarioId',
        'valor',
      ]);
    });

    it('CA-RF29-03 usa la colección cargosrecurrentes y registra las fechas de creación y modificación', () => {
      expect(CargoRecurrenteSchema.get('collection')).toBe('cargosrecurrentes');
      expect(CargoRecurrenteSchema.get('timestamps')).toBe(true);
    });
  });

  describe('usuario y tarjeta', () => {
    it('CA-RF29-04 usuarioId es un ObjectId que referencia a Usuario', () => {
      const campo = CargoRecurrenteSchema.path('usuarioId');

      expect(campo.instance).toBe('ObjectId');
      expect(campo.options.ref).toBe('Usuario');
    });

    it.each([undefined, null, 'no-es-un-id'])(
      'CA-RF29-05 rechaza un cargo con usuarioId inválido (%s)',
      (usuarioId) => {
        expect(camposConError(datosValidos({ usuarioId }))).toEqual([
          'usuarioId',
        ]);
      },
    );

    it('CA-RF29-06 tarjetaId es un ObjectId que referencia a TarjetaCredito', () => {
      const campo = CargoRecurrenteSchema.path('tarjetaId');

      expect(campo.instance).toBe('ObjectId');
      expect(campo.options.ref).toBe('TarjetaCredito');
    });

    it.each([undefined, null, 'no-es-un-id'])(
      'CA-RF29-07 rechaza un cargo con tarjetaId inválido (%s)',
      (tarjetaId) => {
        expect(camposConError(datosValidos({ tarjetaId }))).toEqual([
          'tarjetaId',
        ]);
      },
    );
  });

  describe('descripción', () => {
    it.each([undefined, null, '', '   '])(
      'CA-RF29-08 rechaza un cargo sin descripción (%j)',
      (descripcion) => {
        expect(camposConError(datosValidos({ descripcion }))).toEqual([
          'descripcion',
        ]);
      },
    );

    it('CA-RF29-09 guarda la descripción sin espacios sobrantes', () => {
      const cargo = new CargoModelo(
        datosValidos({ descripcion: '  Netflix  ' }),
      );

      expect(cargo.validateSync()).toBeUndefined();
      expect(cargo.descripcion).toBe('Netflix');
    });

    it('CA-RF29-10 acepta una descripción de 100 caracteres y rechaza una de 101', () => {
      expect(
        camposConError(datosValidos({ descripcion: 'a'.repeat(100) })),
      ).toEqual([]);
      expect(
        camposConError(datosValidos({ descripcion: 'a'.repeat(101) })),
      ).toEqual(['descripcion']);
    });
  });

  describe('valor', () => {
    it.each([undefined, null, 'barato'])(
      'CA-RF29-11 rechaza un cargo con valor ausente o no numérico (%s)',
      (valor) => {
        expect(camposConError(datosValidos({ valor }))).toEqual(['valor']);
      },
    );

    it.each([0, -38900])(
      'CA-RF29-12 rechaza un valor en cero o negativo (%s)',
      (valor) => {
        expect(camposConError(datosValidos({ valor }))).toEqual(['valor']);
      },
    );

    it.each([1, 38900, 1500000.5, 999999999])(
      'CA-RF29-13 acepta el valor %s sin tope superior',
      (valor) => {
        const cargo = new CargoModelo(datosValidos({ valor }));

        expect(cargo.validateSync()).toBeUndefined();
        expect(cargo.valor).toBe(valor);
      },
    );
  });

  describe('activar y desactivar', () => {
    it('CA-RF29-14 activo vale true si no se indica', () => {
      const cargo = new CargoModelo(sin('activo'));

      expect(cargo.validateSync()).toBeUndefined();
      expect(cargo.activo).toBe(true);
    });

    it.each([true, false])(
      'CA-RF29-15 acepta activo %s y lo conserva',
      (activo) => {
        const cargo = new CargoModelo(datosValidos({ activo }));

        expect(cargo.validateSync()).toBeUndefined();
        expect(cargo.activo).toBe(activo);
      },
    );

    it('CA-RF29-15 rechaza un activo que no es lógico', () => {
      expect(camposConError(datosValidos({ activo: 'quizás' }))).toEqual([
        'activo',
      ]);
    });
  });

  describe('índices', () => {
    it('CA-RF29-16 hay un índice por usuarioId y otro por tarjetaId', () => {
      expect(primerasClaves()).toContain('usuarioId');
      expect(primerasClaves()).toContain('tarjetaId');
    });

    it('CA-RF29-17 ningún índice es único: dos cargos iguales en la misma tarjeta son legítimos', () => {
      expect(
        CargoRecurrenteSchema.indexes().filter(
          ([, opciones]) => opciones?.unique,
        ),
      ).toEqual([]);
    });
  });
});
