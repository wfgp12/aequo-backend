import { cerca, OTRO_USUARIO_ID, TERCER_USUARIO_ID, usarEntornoProgreso } from '../../test/ahorro/arnes-progreso.js';

/**
 * Cálculo del progreso del mes (RF-22): GET /ahorro/progreso. Integración con el guard de sesión real y MongoDB simulado.
 * El "mes base" (2026-11): ingreso propio 3.000.000, egresos 2.700.000 (1.200.000 + 600.000 + pago de tarjeta 700.000 +
 * abono 200.000), préstamo recibido 500.000 que no cuenta, ahorro del mes 300.000.
 */
describe('GET /ahorro/progreso: cálculo del disponible y del avance (RF-22, integración)', () => {
  const entorno = usarEntornoProgreso();

  const progreso = async (mes = '2026-11') => {
    const respuesta = await entorno.progreso(`mes=${mes}`);
    expect(respuesta.status).toBe(200);
    return respuesta.body;
  };

  describe('cálculo con meta', () => {
    it('CA-RF22-01 meta de porcentaje: disponible y avance', async () => {
      entorno.sembrarMesBase();
      const idMeta = await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });

      const body = await progreso();

      expect(body.periodo).toBe('2026-11');
      cerca(body.ingresoPropio, 3_000_000);
      cerca(body.egresos, 2_700_000);
      cerca(body.ahorroDelMes, 300_000);
      expect(body.meta).toMatchObject({ id: idMeta, tipoMeta: 'PORCENTAJE', valorObjetivo: 20 });
      cerca(body.meta.montoMeta, 600_000);
      cerca(body.disponible, -300_000);
      cerca(body.porcentajeAvance, 50);
    });

    it('CA-RF22-02 meta de monto fijo excedida', async () => {
      entorno.sembrarMesBase();
      await entorno.sembrarMeta({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 200_000, periodo: '2026-11' });

      const body = await progreso();

      cerca(body.meta.montoMeta, 200_000);
      cerca(body.disponible, 100_000);
      cerca(body.porcentajeAvance, 150);
    });

    it('CA-RF22-03 meta cumplida exactamente', async () => {
      entorno.sembrarMesBase();
      await entorno.sembrarMeta({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300_000, periodo: '2026-11' });

      const body = await progreso();

      cerca(body.disponible, 0);
      cerca(body.porcentajeAvance, 100);
    });

    it('CA-RF22-04 meta de porcentaje excedida', async () => {
      entorno.ingreso('2026-11-01', 2_800_000);
      entorno.ingreso('2026-11-15', 200_000);
      entorno.dineroRecibido('2026-11-08', 500_000);
      entorno.egreso('2026-11-03', 1_200_000);
      entorno.egreso('2026-11-10', 800_000);
      await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });

      const body = await progreso();

      cerca(body.ahorroDelMes, 1_000_000);
      cerca(body.meta.montoMeta, 600_000);
      cerca(body.disponible, 400_000);
      cerca(body.porcentajeAvance, (1_000_000 / 600_000) * 100, 6);
    });
  });

  describe('sin meta, sin ingreso y valores extremos', () => {
    it('CA-RF22-05 mes sin meta: se calcula el disponible sin meta y se indica', async () => {
      entorno.sembrarMesBase();

      const respuesta = await entorno.progreso('mes=2026-11');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.meta).toBeNull();
      expect(respuesta.body.porcentajeAvance).toBeNull();
      cerca(respuesta.body.ingresoPropio, 3_000_000);
      cerca(respuesta.body.egresos, 2_700_000);
      cerca(respuesta.body.ahorroDelMes, 300_000);
      cerca(respuesta.body.disponible, 300_000);
    });

    it('CA-RF22-06 la meta de otro mes no se usa', async () => {
      entorno.sembrarMesBase();
      entorno.ingreso('2026-12-05', 1_000_000);
      await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-12' });

      const noviembre = await progreso('2026-11');
      expect(noviembre.meta).toBeNull();
      cerca(noviembre.disponible, 300_000);

      const diciembre = await progreso('2026-12');
      expect(diciembre.meta).not.toBeNull();
      cerca(diciembre.meta.montoMeta, 200_000);
    });

    it('CA-RF22-07 mes sin movimientos, meta de porcentaje: división por cero', async () => {
      await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });

      const body = await progreso();

      cerca(body.ingresoPropio, 0);
      cerca(body.egresos, 0);
      cerca(body.ahorroDelMes, 0);
      cerca(body.meta.montoMeta, 0);
      cerca(body.disponible, 0);
      expect(body.porcentajeAvance).toBeNull();
    });

    it('CA-RF22-08 mes sin movimientos, meta de monto fijo', async () => {
      await entorno.sembrarMeta({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300_000, periodo: '2026-11' });

      const body = await progreso();

      cerca(body.ahorroDelMes, 0);
      cerca(body.disponible, -300_000);
      cerca(body.porcentajeAvance, 0);
    });

    it.each(['2026-11', '2031-05'])('CA-RF22-09 mes sin movimientos y sin meta (%s)', async (mes) => {
      const body = await progreso(mes);

      for (const campo of ['ingresoPropio', 'egresos', 'ahorroDelMes', 'disponible']) cerca(body[campo], 0);
      expect(body.meta).toBeNull();
      expect(body.porcentajeAvance).toBeNull();
    });

    it('CA-RF22-10 gastos sin ingreso propio y meta de porcentaje', async () => {
      await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });
      entorno.egreso('2026-11-12', 100_000);

      const body = await progreso();

      cerca(body.ingresoPropio, 0);
      cerca(body.meta.montoMeta, 0);
      cerca(body.ahorroDelMes, -100_000);
      cerca(body.disponible, -100_000);
      expect(body.porcentajeAvance).toBeNull();
    });

    it('CA-RF22-11 ahorro del mes negativo', async () => {
      entorno.ingreso('2026-11-01', 1_000_000);
      entorno.egreso('2026-11-05', 1_250_000);
      await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });

      const body = await progreso();

      cerca(body.ahorroDelMes, -250_000);
      cerca(body.meta.montoMeta, 200_000);
      cerca(body.disponible, -450_000);
      cerca(body.porcentajeAvance, -125);
    });

    it('CA-RF22-12 monto fijo mayor que el ingreso propio', async () => {
      entorno.ingreso('2026-11-01', 1_000_000);
      await entorno.sembrarMeta({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 1_500_000, periodo: '2026-11' });

      const body = await progreso();

      cerca(body.disponible, -500_000);
      cerca(body.porcentajeAvance, (1_000_000 / 1_500_000) * 100, 6);
    });

    it('CA-RF22-13 sin redondeo: la precisión completa llega al cliente (RNF-11)', async () => {
      entorno.ingreso('2026-11-01', 1_254_700);
      entorno.pagoTarjeta('2026-11-10', 119_802.13);
      await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 12.5, periodo: '2026-11' });

      const body = await progreso();

      cerca(body.egresos, 119_802.13, 2);
      cerca(body.ahorroDelMes, 1_134_897.87, 2);
      cerca(body.meta.montoMeta, 156_837.5, 2);
      cerca(body.disponible, 978_060.37, 2);
      cerca(body.porcentajeAvance, 723.6138, 3);
    });
  });

  describe('reglas de flujo de caja (ADR-014)', () => {
    it('CA-RF22-14 el dinero recibido no es ingreso propio', async () => {
      entorno.sembrarMesBase();
      await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });

      const body = await progreso();
      cerca(body.ingresoPropio, 3_000_000);
      cerca(body.meta.montoMeta, 600_000);

      entorno.dineroRecibido('2026-10-12', 500_000);
      const soloPrestamo = await progreso('2026-10');
      cerca(soloPrestamo.ingresoPropio, 0);
      cerca(soloPrestamo.ahorroDelMes, 0);
    });

    it('CA-RF22-15 los pagos de tarjeta y los abonos a deudas son salidas de dinero del mes', async () => {
      entorno.ingreso('2026-11-01', 1_000_000);
      entorno.pagoTarjeta('2026-11-10', 119_802.13);
      entorno.abonoDeuda('2026-11-12', 80_000);

      const body = await progreso();

      cerca(body.egresos, 199_802.13, 2);
      cerca(body.ahorroDelMes, 800_197.87, 2);
      cerca(body.disponible, 800_197.87, 2);
    });

    it('CA-RF22-16 las cifras coinciden con GET /reportes/periodo', async () => {
      entorno.sembrarMesBase();

      const respuestaAhorro = await entorno.progreso('mes=2026-11');
      const respuestaReporte = await entorno.reporte('mes=2026-11');
      expect(respuestaAhorro.status).toBe(200);
      expect(respuestaReporte.status).toBe(200);
      const ahorro = respuestaAhorro.body;
      const reporte = respuestaReporte.body;

      cerca(ahorro.ingresoPropio, reporte.ingresos);
      cerca(ahorro.ahorroDelMes, reporte.balance);
      cerca(ahorro.egresos, reporte.egresos + reporte.pagosTarjeta + reporte.abonosDeuda);
    });
  });

  describe('datos de otros usuarios y consistencia', () => {
    it('CA-RF22-21 los datos de otro usuario nunca cuentan', async () => {
      entorno.sembrarMesBase();
      const idMeta = await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });
      entorno.ingreso('2026-11-02', 9_000_000, OTRO_USUARIO_ID);
      entorno.egreso('2026-11-04', 4_000_000, OTRO_USUARIO_ID);
      await entorno.sembrarMeta({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 1_000_000, periodo: '2026-11' }, OTRO_USUARIO_ID);

      const body = await progreso();

      cerca(body.ingresoPropio, 3_000_000);
      cerca(body.egresos, 2_700_000);
      cerca(body.disponible, -300_000);
      cerca(body.porcentajeAvance, 50);
      expect(body.meta.id).toBe(idMeta);

      const vacio = await entorno.progreso('mes=2026-11', { token: entorno.tokenDe(TERCER_USUARIO_ID) });
      expect(vacio.status).toBe(200);
      for (const campo of ['ingresoPropio', 'egresos', 'ahorroDelMes', 'disponible']) cerca(vacio.body[campo], 0);
      expect(vacio.body.meta).toBeNull();
    });

    it('CA-RF22-22 el cálculo refleja de inmediato los cambios', async () => {
      entorno.sembrarMesBase();
      const idMeta = await entorno.sembrarMeta({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });
      cerca((await progreso()).disponible, -300_000);

      const ajuste = await entorno.editarMeta(idMeta, { valorObjetivo: 25 });
      expect(ajuste.status).toBe(200);
      cerca((await progreso()).meta.montoMeta, 750_000);

      entorno.ingreso('2026-11-25', 500_000);
      const body = await progreso();
      cerca(body.ingresoPropio, 3_500_000);
      cerca(body.ahorroDelMes, 800_000);
      cerca(body.meta.montoMeta, 875_000);
      cerca(body.disponible, -75_000);
      cerca(body.porcentajeAvance, (800_000 / 875_000) * 100, 6);
    });

    it('CA-RF22-23 consultar el progreso no modifica nada', async () => {
      entorno.sembrarMesBase();
      const idMeta = await entorno.sembrarMeta(
        { tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11', ahorroReal: 150_000 },
      );
      const antes = JSON.stringify(entorno.metaGuardada(idMeta));
      const transaccionesAntes = entorno.transacciones.docs.length;

      for (let i = 0; i < 3; i++) await progreso();

      expect(JSON.stringify(entorno.metaGuardada(idMeta))).toBe(antes);
      expect(entorno.metaGuardada(idMeta)?.ahorroReal).toBe(150_000);
      expect(entorno.metas.docs).toHaveLength(1);
      expect(entorno.transacciones.docs).toHaveLength(transaccionesAntes);
    });
  });
});
