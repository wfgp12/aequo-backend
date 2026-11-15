import {
  CUOTA_REFERENCIA,
  cerca,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.2.3 (RF-27, RF-25): la cuota y el mes del último pago que devuelve cada compra, y el cambio de tasa.
describe('Compras con tarjeta: cuota, mes del último pago y cambio de tasa (integración)', () => {
  const e = usarEntornoCompras();

  describe('RF-27: cuota y mes del último pago en la respuesta', () => {
    it('CA-RF27-34 la compra devuelve su cuota con precisión completa, sin redondear', async () => {
      const visa = await e.sembrarTarjeta({
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: false,
      });
      const creada = await e.crearCompra(visa, e.compraBase());

      const { status, body } = await e.obtenerCompra(visa, creada.body.id);

      expect(status).toBe(200);
      cerca(body.cuota, CUOTA_REFERENCIA, 6);
      expect(body.cuota).not.toBe(119802.13);
      expect(body.cuota).not.toBe(119802);
    });

    it('CA-RF27-35 una cuota sin interés solo con la bandera de la tarjeta copiada', async () => {
      const debito = await e.sembrarTarjeta({
        nombre: 'Débito',
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: true,
      });
      const visa = await e.sembrarTarjeta({
        nombre: 'Visa',
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: false,
      });
      const compra = (cuotas: number) => e.compraBase({ valor: 80000, cuotas });

      const sinInteres = await e.crearCompra(debito, compra(1));
      const conInteres = await e.crearCompra(visa, compra(1));
      const dosCuotas = await e.crearCompra(debito, compra(2));

      cerca(sinInteres.body.cuota, 80000, 6);
      cerca(conInteres.body.cuota, 81726.8319, 4);
      // La bandera solo exime la cuota única: a 2 cuotas se aplica el interés (80.000 a 2 cuotas con 29,21 % E.A.).
      cerca(dosCuotas.body.cuota, 41299.7335, 4);
      expect(dosCuotas.body.cuota).toBeGreaterThan(40000);
    });

    it('CA-RF27-36 con tasa cero la cuota es el valor entre las cuotas', async () => {
      const visa = await e.sembrarTarjeta({ tasaEA: 0 });

      const { status, body } = await e.crearCompra(
        visa,
        e.compraBase({ valor: 120000, cuotas: 12 }),
      );

      expect(status).toBe(201);
      expect(body.cuota).toBe(10000);
      expect(body.tasaEAAplicada).toBe(0);
    });

    it('CA-RF27-37 el mes del último pago cruza años y es el mismo mes con una cuota', async () => {
      const visa = await e.sembrarTarjeta();
      const casos: Array<[string, number, string]> = [
        ['2026-12', 12, '2027-11'],
        ['2026-11', 24, '2028-10'],
        ['2026-01-31', 1, '2026-01'],
      ];

      for (const [primerPago, cuotas, mesUltimoPago] of casos) {
        const { status, body } = await e.crearCompra(
          visa,
          e.compraBase({ primerPago, cuotas }),
        );

        expect(status).toBe(201);
        expect(body.mesUltimoPago).toBe(mesUltimoPago);
      }
    });

    it('CA-RF27-38 cada compra del listado trae su cuota calculada con su propia tasa', async () => {
      const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });
      const primera = await e.crearCompra(visa, e.compraBase());
      await e.editarTarjeta(visa, { tasaEA: 0.31 });
      const segunda = await e.crearCompra(visa, e.compraBase());

      const { status, body } = await e.listarCompras(visa);

      expect(status).toBe(200);
      const de = (id: string) =>
        body.items.find((c: { id: string }) => c.id === id);
      cerca(de(primera.body.id).cuota, 119802.13, 2);
      expect(de(primera.body.id).tasaEAAplicada).toBe(0.2921);
      cerca(de(segunda.body.id).cuota, 120662.1703, 4);
      expect(de(segunda.body.id).tasaEAAplicada).toBe(0.31);
    });
  });

  describe('RF-25: el cambio de tasa y de bandera de la tarjeta no recalcula compras anteriores', () => {
    it('CA-RF25-07 cambiar la tasa de la tarjeta no altera la cuota de las compras anteriores', async () => {
      const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });
      const primera = await e.crearCompra(visa, e.compraBase());

      const cambio = await e.editarTarjeta(visa, { tasaEA: 0.31 });
      const segunda = await e.crearCompra(visa, e.compraBase());
      const consultada = await e.obtenerCompra(visa, primera.body.id);

      expect(cambio.status).toBe(200);
      expect(consultada.body.tasaEAAplicada).toBe(0.2921);
      cerca(consultada.body.cuota, 119802.13, 2);
      expect(segunda.body.tasaEAAplicada).toBe(0.31);
      cerca(segunda.body.cuota, 120662.17, 2);
      expect(
        e.compras.docs.find((doc) => String(doc._id) === primera.body.id)
          ?.tasaEAAplicada,
      ).toBe(0.2921);
    });

    it('CA-RF25-08 cambiar la bandera de la tarjeta tampoco recalcula las compras anteriores', async () => {
      const visa = await e.sembrarTarjeta({
        tasaEA: 0.2921,
        cuotaUnicaSinInteres: true,
      });
      const compra = () => e.compraBase({ valor: 80000, cuotas: 1 });
      const primera = await e.crearCompra(visa, compra());

      const cambio = await e.editarTarjeta(visa, {
        cuotaUnicaSinInteres: false,
      });
      const segunda = await e.crearCompra(visa, compra());
      const consultada = await e.obtenerCompra(visa, primera.body.id);

      expect(cambio.status).toBe(200);
      expect(consultada.body.cuotaUnicaSinInteres).toBe(true);
      expect(consultada.body.cuota).toBe(80000);
      expect(segunda.body.cuotaUnicaSinInteres).toBe(false);
      cerca(segunda.body.cuota, 81726.8319, 4);
    });

    it('CA-RF25-09 editar una compra no vuelve a copiar la tasa de la tarjeta', async () => {
      const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });
      const creada = await e.crearCompra(visa, e.compraBase());
      await e.editarTarjeta(visa, { tasaEA: 0.31 });

      const { status, body } = await e.editarCompra(visa, creada.body.id, {
        cuotas: 6,
      });

      expect(status).toBe(200);
      expect(body.tasaEAAplicada).toBe(0.2921);
      cerca(body.cuota, 225196.2789, 4);
    });
  });
});
