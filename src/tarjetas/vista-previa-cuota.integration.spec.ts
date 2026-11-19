import {
  CLAVES_DE_LA_VISTA_PREVIA,
  CUOTA_REFERENCIA,
  cerca,
  consultaCuota,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.2.6 (RF-27): GET /tarjetas/:tarjetaId/cuota, la vista previa de la cuota y del mes del último pago antes de
// guardar una compra o un avance. Aquí, lo que responde; los efectos y la consulta están en los otros dos archivos.
describe('GET /tarjetas/:tarjetaId/cuota: la respuesta de la vista previa (integración)', () => {
  const e = usarEntornoCompras();

  describe('RF-27: cuota y mes del último pago', () => {
    it('CA-RF27-39 la compra de referencia de la hoja del promotor responde 200 con exactamente cuatro campos', async () => {
      const visa = await e.sembrarTarjeta({
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: false,
      });

      const { status, body } = await e.vistaPreviaCuota(
        visa,
        'valor=1254700&cuotas=12&primerPago=2026-12',
      );

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(CLAVES_DE_LA_VISTA_PREVIA);
      cerca(body.cuota, 119802.13, 2);
      expect(body.mesUltimoPago).toBe('2027-11');
      expect(body.tasaEAAplicada).toBe(0.2921);
      expect(body.cuotaUnicaSinInteres).toBe(false);
    });

    it('CA-RF27-40 la cuota llega con precisión completa, sin redondear', async () => {
      const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });

      const { status, body } = await e.vistaPreviaCuota(visa, consultaCuota());

      expect(status).toBe(200);
      cerca(body.cuota, CUOTA_REFERENCIA, 6);
      expect(body.cuota).not.toBe(119802.13);
      expect(body.cuota).not.toBe(119802);
    });

    const meses: Array<[string, number, string]> = [
      ['2026-12', 1, '2026-12'],
      ['2026-12', 60, '2031-11'],
      ['2026-11', 24, '2028-10'],
      ['2026-12-15', 12, '2027-11'],
      ['2026-01-31', 1, '2026-01'],
    ];

    it.each(meses)(
      'CA-RF27-41 con primerPago %s y %i cuotas el mes del último pago es %s',
      async (primerPago, cuotas, mesUltimoPago) => {
        const visa = await e.sembrarTarjeta();

        const { status, body } = await e.vistaPreviaCuota(
          visa,
          consultaCuota({ primerPago, cuotas }),
        );

        expect(status).toBe(200);
        expect(body.mesUltimoPago).toBe(mesUltimoPago);
      },
    );

    it('CA-RF27-42 una cuota sin la bandera cobra un mes de interés; con la bandera, no', async () => {
      const visa = await e.sembrarTarjeta({
        nombre: 'Visa',
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: false,
      });
      const debito = await e.sembrarTarjeta({
        nombre: 'Débito',
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: true,
      });

      const conInteres = await e.vistaPreviaCuota(
        visa,
        consultaCuota({ valor: 80000, cuotas: 1 }),
      );
      const sinInteres = await e.vistaPreviaCuota(
        debito,
        consultaCuota({ valor: 80000, cuotas: 1 }),
      );
      const dosCuotas = await e.vistaPreviaCuota(
        debito,
        consultaCuota({ valor: 80000, cuotas: 2 }),
      );

      expect(conInteres.status).toBe(200);
      cerca(conInteres.body.cuota, 81726.8319, 4);
      expect(sinInteres.status).toBe(200);
      cerca(sinInteres.body.cuota, 80000, 6);
      expect(sinInteres.body.cuotaUnicaSinInteres).toBe(true);
      // La bandera solo exime la cuota única: a 2 cuotas se aplica el interés.
      expect(dosCuotas.status).toBe(200);
      cerca(dosCuotas.body.cuota, 41299.7335, 4);
    });

    it('CA-RF27-43 con tasa cero la cuota es el valor entre las cuotas', async () => {
      const visa = await e.sembrarTarjeta({ tasaEA: 0 });

      const docePagos = await e.vistaPreviaCuota(
        visa,
        consultaCuota({ valor: 120000, cuotas: 12 }),
      );
      const unaCuota = await e.vistaPreviaCuota(
        visa,
        consultaCuota({ valor: '100.5', cuotas: 1 }),
      );

      expect(docePagos.status).toBe(200);
      expect(docePagos.body.cuota).toBe(10000);
      expect(docePagos.body.tasaEAAplicada).toBe(0);
      expect(unaCuota.status).toBe(200);
      expect(unaCuota.body.cuota).toBe(100.5);
      expect(unaCuota.body.tasaEAAplicada).toBe(0);
    });

    it('CA-RF27-44 valores decimales, muy pequeños y muy grandes', async () => {
      const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });

      const pequeno = await e.vistaPreviaCuota(
        visa,
        consultaCuota({ valor: '0.01', cuotas: 3 }),
      );
      const grande = await e.vistaPreviaCuota(
        visa,
        consultaCuota({ valor: 999999999, cuotas: 60 }),
      );

      expect(pequeno.status).toBe(200);
      cerca(pequeno.body.cuota, 0.003478, 6);
      expect(grande.status).toBe(200);
      cerca(grande.body.cuota, 29882762.5028, 4);
      for (const { body } of [pequeno, grande]) {
        expect(Number.isFinite(body.cuota)).toBe(true);
        expect(body.cuota).toBeGreaterThan(0);
      }
    });
  });

  describe('RF-27 y RF-25: la tasa y la bandera de la tarjeta', () => {
    it('CA-RF27-45 la respuesta trae la tasa y la bandera que la tarjeta tiene hoy', async () => {
      const visa = await e.sembrarTarjeta({
        tasaEA: 0.31,
        cuotaUnicaSinInteres: true,
      });

      const { status, body } = await e.vistaPreviaCuota(visa, consultaCuota());

      expect(status).toBe(200);
      expect(body.tasaEAAplicada).toBe(0.31);
      expect(body.cuotaUnicaSinInteres).toBe(true);
    });

    it('CA-RF27-46 usa la tasa actual de la tarjeta, sin caché, y no toca las compras anteriores', async () => {
      const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });
      const creada = await e.crearCompra(visa, e.compraBase());
      const antes = await e.vistaPreviaCuota(visa, consultaCuota());
      expect(antes.status).toBe(200);
      cerca(antes.body.cuota, 119802.13, 2);

      const cambio = await e.editarTarjeta(visa, { tasaEA: 0.31 });
      const despues = await e.vistaPreviaCuota(visa, consultaCuota());
      const compra = await e.obtenerCompra(visa, creada.body.id);

      expect(cambio.status).toBe(200);
      expect(despues.status).toBe(200);
      cerca(despues.body.cuota, 120662.1703, 4);
      expect(despues.body.tasaEAAplicada).toBe(0.31);
      expect(compra.body.tasaEAAplicada).toBe(0.2921);
      cerca(compra.body.cuota, 119802.13, 2);
    });

    const tarjetas: Array<[string, number, boolean]> = [
      ['Visa', 0.2921, false],
      ['Débito', 0.2921, true],
      ['Cero', 0, false],
    ];

    it('CA-RF27-47 la vista previa coincide con lo que guarda la compra', async () => {
      for (const [nombre, tasaEA, cuotaUnicaSinInteres] of tarjetas) {
        const tarjeta = await e.sembrarTarjeta({
          nombre,
          tasaEA,
          cuotaUnicaSinInteres,
        });
        const casos = [
          { valor: 1254700, cuotas: 12 },
          { valor: 80000, cuotas: 1 },
        ];

        for (const { valor, cuotas } of casos) {
          const etiqueta = `${nombre} ${valor} a ${cuotas}`;
          const previa = await e.vistaPreviaCuota(
            tarjeta,
            consultaCuota({ valor, cuotas }),
          );
          const guardada = await e.crearCompra(
            tarjeta,
            e.compraBase({ valor, cuotas }),
          );

          expect(previa.status, etiqueta).toBe(200);
          expect(guardada.status, etiqueta).toBe(201);
          expect(previa.body, etiqueta).toEqual({
            cuota: guardada.body.cuota,
            mesUltimoPago: guardada.body.mesUltimoPago,
            tasaEAAplicada: guardada.body.tasaEAAplicada,
            cuotaUnicaSinInteres: guardada.body.cuotaUnicaSinInteres,
          });
        }
      }
    });

    it('CA-RF27-48 sirve también para el resumen de un avance', async () => {
      const visa = await e.sembrarTarjeta({
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: false,
      });

      const previa = await e.vistaPreviaCuota(
        visa,
        consultaCuota({ valor: 500000, cuotas: 6, primerPago: '2026-12' }),
      );
      const avance = await e.crearAvance(visa, e.avanceBase());

      expect(previa.status).toBe(200);
      expect(avance.status).toBe(201);
      cerca(previa.body.cuota, 89741.0851, 4);
      expect(previa.body.mesUltimoPago).toBe('2027-05');
      expect(previa.body).toEqual({
        cuota: avance.body.cuota,
        mesUltimoPago: avance.body.mesUltimoPago,
        tasaEAAplicada: avance.body.tasaEAAplicada,
        cuotaUnicaSinInteres: avance.body.cuotaUnicaSinInteres,
      });
    });
  });
});
