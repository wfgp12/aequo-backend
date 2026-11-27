import mongoose from 'mongoose';
import { TransaccionSchema } from '../transacciones/transaccion.schema.js';

// Paquete 6.1.1 (RF-34, ADR-014): lo prestado y lo abonado salen de las transacciones asociadas a la deuda.
// Archivo aparte porque no depende del esquema de Deuda: protege algo que ya existe.
describe('Transacciones asociadas a una deuda', () => {
  const TransaccionModelo = mongoose.model(
    'TransaccionDeDeudaSoloParaPruebas',
    TransaccionSchema,
  );

  it('CA-RF34-11 un préstamo y un abono sin categoría se asocian a la misma deuda con deudaId', () => {
    const deudaId = new mongoose.Types.ObjectId();
    const comunes = {
      usuarioId: new mongoose.Types.ObjectId(),
      fecha: '2026-11-26T00:00:00.000Z',
      metodoPago: 'EFECTIVO',
      deudaId,
    };
    const prestamo = new TransaccionModelo({
      ...comunes,
      tipo: 'INGRESO',
      clasificacionFlujo: 'DINERO_RECIBIDO',
      monto: 500000,
    });
    const abono = new TransaccionModelo({
      ...comunes,
      tipo: 'EGRESO',
      clasificacionFlujo: 'ABONO_DEUDA',
      monto: 100000,
    });
    const campo = TransaccionSchema.path('deudaId');

    for (const transaccion of [prestamo, abono]) {
      expect(transaccion.validateSync()).toBeUndefined();
      expect(String(transaccion.deudaId)).toBe(String(deudaId));
      expect(transaccion.categoriaId).toBeNull();
    }
    expect(campo.instance).toBe('ObjectId');
    expect(campo.options.ref).toBe('Deuda');
  });
});
