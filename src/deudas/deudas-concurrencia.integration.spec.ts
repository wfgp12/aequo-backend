import { dia, type Doc, usarEntornoDeudas } from '../../test/deudas/arnes-deudas.js';
import { cruzar } from '../../test/deudas/cruzar-peticiones.js';

// Paquete 6.1.2 (RF-34): dos escrituras simultáneas del mismo usuario sobre la misma deuda deben dejar los datos como
// los dejaría alguna ejecución una detrás de otra.
describe('Deudas: escrituras simultáneas sobre la misma deuda (integración)', () => {
  const e = usarEntornoDeudas();

  /** Ningún préstamo apunta a una deuda que no existe y ninguna deuda se queda sin préstamos. */
  const sinHuerfanos = () => {
    const deudas = e.deudas.docs.map((deuda) => String(deuda._id)).sort();
    const conPrestamos = [...new Set(e.transacciones.docs.map((t) => String(t.deudaId)))].sort();
    expect(conPrestamos).toEqual(deudas);
  };

  const deudaConUnPrestamo = async () => {
    const deudaId = await e.sembrarDeuda();
    const prestamoId = await e.sembrarPrestamo(deudaId);
    return { deudaId, prestamoId };
  };

  const idsListados = async (): Promise<string[]> => {
    const { body } = await e.listar();
    return body.items.flatMap((deuda: Doc) => deuda.prestamos.map((prestamo: Doc) => prestamo.id));
  };

  const nuevo = () => e.prestamoBase({ monto: 200000, fecha: '2026-11-20' });

  it('CA-RF34-28 sumar un préstamo mientras se elimina el único: el nuevo no queda sin deuda', async () => {
    const { deudaId, prestamoId } = await deudaConUnPrestamo();

    // El registro ya encontró la deuda y va a guardar el préstamo cuando llega el borrado.
    const [registro, borrado] = await cruzar(
      e,
      { coleccion: e.transacciones, operacion: 'crear' },
      () => e.registrar(nuevo()),
      () => e.eliminar(deudaId, prestamoId),
    );

    expect([registro.status, borrado.status]).toEqual([201, 204]);
    sinHuerfanos();
    expect(await idsListados()).toEqual([registro.body.prestamo.id]);
  });

  it('CA-RF34-28 eliminar el único préstamo mientras se suma otro: el nuevo no queda sin deuda', async () => {
    const { deudaId, prestamoId } = await deudaConUnPrestamo();

    // El borrado ya quitó el préstamo y va a quitar la deuda cuando llega el registro.
    const [borrado, registro] = await cruzar(
      e,
      { coleccion: e.deudas, operacion: 'borrar' },
      () => e.eliminar(deudaId, prestamoId),
      () => e.registrar(nuevo()),
    );

    expect([borrado.status, registro.status]).toEqual([204, 201]);
    sinHuerfanos();
    expect(await idsListados()).toEqual([registro.body.prestamo.id]);
  });

  it('CA-RF34-28 eliminar a la vez los dos únicos préstamos: no queda una deuda sin préstamos', async () => {
    const { deudaId, prestamoId } = await deudaConUnPrestamo();
    const otro = await e.sembrarPrestamo(deudaId, { monto: 200000, fecha: dia('2026-11-20') });

    // El primer borrado ya contó dos préstamos y va a quitar el suyo cuando llega el segundo.
    const [primero, segundo] = await cruzar(
      e,
      { coleccion: e.transacciones, operacion: 'borrar' },
      () => e.eliminar(deudaId, prestamoId),
      () => e.eliminar(deudaId, otro),
    );

    expect([primero.status, segundo.status]).toEqual([204, 204]);
    sinHuerfanos();
    expect(e.deudas.docs).toHaveLength(0);
    expect(e.transacciones.docs).toHaveLength(0);
  });
});
