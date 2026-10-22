import mongoose from 'mongoose';
import {
  ClasificacionFlujo,
  METODOS_DE_PAGO_DE_TRANSACCION,
  MetodoPago,
  TipoTransaccion,
} from './transaccion.enums.js';
import { TransaccionSchema } from './transaccion.schema.js';

// Criterio del 2.1.1: el esquema soporta el registro de ingresos y egresos con sus atributos requeridos.
describe('Esquema de Transacción', () => {
  const TransaccionModelo = mongoose.model('TransaccionSoloParaPruebas', TransaccionSchema);
  const nuevoId = () => new mongoose.Types.ObjectId();
  const datosValidos = (cambios: Record<string, unknown> = {}) => ({
    usuarioId: nuevoId(),
    tipo: 'EGRESO',
    monto: 15000,
    fecha: new Date('2026-10-20T12:00:00Z'),
    categoriaId: nuevoId(),
    metodoPago: 'EFECTIVO',
    ...cambios,
  });
  const camposConError = (datos: Record<string, unknown>) =>
    Object.keys(new TransaccionModelo(datos).validateSync()?.errors ?? {});

  it('guarda los atributos de una transacción y nada más', () => {
    const campos = Object.keys(TransaccionSchema.paths).filter(
      (campo) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(campo),
    );

    expect(campos.sort()).toEqual([
      'categoriaId',
      'clasificacionFlujo',
      'descripcion',
      'deudaId',
      'fecha',
      'metodoPago',
      'monto',
      'tarjetaId',
      'tipo',
      'usuarioId',
    ]);
  });

  describe('ingresos y egresos', () => {
    it.each(Object.values(TipoTransaccion))('acepta una transacción de tipo %s', (tipo) => {
      expect(camposConError(datosValidos({ tipo }))).toEqual([]);
    });

    it('rechaza un tipo que no sea INGRESO ni EGRESO', () => {
      expect(camposConError(datosValidos({ tipo: 'OTRO' }))).toEqual(['tipo']);
    });
  });

  describe('atributos obligatorios', () => {
    it.each(['usuarioId', 'tipo', 'monto', 'fecha', 'metodoPago'])('%s es obligatorio', (campo) => {
      const datos: Record<string, unknown> = datosValidos();
      delete datos[campo];

      expect(camposConError(datos)).toContain(campo);
    });

    it('la descripción es opcional y vale cadena vacía por defecto; se recortan los espacios', () => {
      expect(new TransaccionModelo(datosValidos()).descripcion).toBe('');
      expect(new TransaccionModelo(datosValidos({ descripcion: '  Mercado  ' })).descripcion).toBe('Mercado');
    });
  });

  describe('monto', () => {
    it.each([1, 0.5, 1254700])('acepta un monto positivo (%s)', (monto) => {
      expect(camposConError(datosValidos({ monto }))).toEqual([]);
    });

    it.each([0, -1, -15000])('rechaza un monto que no es mayor que cero (%s)', (monto) => {
      expect(camposConError(datosValidos({ monto }))).toEqual(['monto']);
    });
  });

  describe('método de pago', () => {
    it.each(METODOS_DE_PAGO_DE_TRANSACCION)('acepta %s', (metodoPago) => {
      expect(camposConError(datosValidos({ metodoPago }))).toEqual([]);
    });

    it('rechaza TARJETA_CREDITO: una compra con tarjeta se guarda como compra, no como transacción', () => {
      expect(camposConError(datosValidos({ metodoPago: MetodoPago.TARJETA_CREDITO }))).toEqual(['metodoPago']);
    });

    it('rechaza un método que no existe', () => {
      expect(camposConError(datosValidos({ metodoPago: 'CHEQUE' }))).toEqual(['metodoPago']);
    });

    it('el enum MetodoPago tiene las cuatro opciones del RF-07', () => {
      expect(Object.values(MetodoPago).sort()).toEqual(['DEBITO', 'EFECTIVO', 'TARJETA_CREDITO', 'TRANSFERENCIA']);
    });
  });

  describe('clasificación de flujo (ADR-014)', () => {
    it('vale ORDINARIO por defecto', () => {
      expect(new TransaccionModelo(datosValidos()).clasificacionFlujo).toBe(ClasificacionFlujo.ORDINARIO);
    });

    it.each(Object.values(ClasificacionFlujo))('acepta %s', (clasificacionFlujo) => {
      expect(camposConError(datosValidos({ clasificacionFlujo }))).toEqual([]);
    });

    it('rechaza una clasificación que no existe', () => {
      expect(camposConError(datosValidos({ clasificacionFlujo: 'OTRA' }))).toEqual(['clasificacionFlujo']);
    });
  });

  describe('referencias (ADR-001)', () => {
    it('la categoría, la tarjeta y la deuda son opcionales y valen null por defecto', () => {
      const transaccion = new TransaccionModelo(datosValidos({ categoriaId: undefined }));

      expect(transaccion.categoriaId).toBeNull();
      expect(transaccion.tarjetaId).toBeNull();
      expect(transaccion.deudaId).toBeNull();
      expect(transaccion.validateSync()).toBeUndefined();
    });

    it('acepta referencias a tarjeta y a deuda (pagos de tarjeta, abonos, préstamos y avances)', () => {
      const datos = datosValidos({ tarjetaId: nuevoId(), deudaId: nuevoId() });

      expect(camposConError(datos)).toEqual([]);
    });

    it.each(['usuarioId', 'categoriaId', 'tarjetaId', 'deudaId'])('%s solo acepta un ObjectId', (campo) => {
      expect(camposConError(datosValidos({ [campo]: 'no-es-un-id' }))).toEqual([campo]);
    });
  });

  it('tiene un índice por usuario y fecha para listar y calcular periodos', () => {
    expect(TransaccionSchema.indexes()).toContainEqual([{ usuarioId: 1, fecha: -1 }, expect.anything()]);
  });

  it('usa la colección transacciones y registra las fechas de creación y modificación', () => {
    expect(TransaccionSchema.get('collection')).toBe('transacciones');
    expect(TransaccionSchema.get('timestamps')).toBe(true);
  });
});
