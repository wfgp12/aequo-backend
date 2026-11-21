import { randomUUID } from 'node:crypto';
import {
  MENSAJES,
  OTRO_USUARIO_ID,
  error404,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import {
  CLAVES_DE_UN_PAGO,
  CLAVES_PROHIBIDAS_DEL_PAGO,
  fotografiaDe,
  fotografiaTotal,
  pagosGuardados,
  sembrarEscenarioConAvanceReal,
} from '../../test/tarjetas/escenario-pagos.js';

const ERROR_401 = {
  statusCode: 401,
  message: 'Sesión inválida o vencida',
  error: 'Unauthorized',
};
const INEXISTENTE = '665f1c2e9b1d4a0012ab34ee';

// Paquete 5.3.2 (RF-32): listar y eliminar los pagos de una tarjeta (D4).
describe('GET y DELETE /tarjetas/:tarjetaId/pagos: listar y eliminar pagos (integración)', () => {
  const e = usarEntornoCompras();

  describe('Listar (GET /tarjetas/:tarjetaId/pagos)', () => {
    it('CA-RF32-35 la lista de pagos: forma y orden (fecha descendente y, a igual fecha, el creado después primero)', async () => {
      const visa = await e.sembrarTarjeta();
      const registros: Array<[number, string, string]> = [
        [1000, '2026-11-30', '2026-12-15T12:00:00.000Z'],
        [2000, '2026-12-05', '2026-12-15T12:00:05.000Z'],
        [3000, '2026-12-05', '2026-12-15T12:00:10.000Z'],
      ];
      for (const [valor, fecha, ahora] of registros) {
        e.hoyEs(ahora);
        expect(
          (await e.crearPago(visa, e.pagoBase({ valor, fecha }))).status,
        ).toBe(201);
      }

      const { status, body } = await e.listarPagos(visa);

      expect(status).toBe(200);
      expect(Object.keys(body)).toEqual(['items']);
      expect(body.items.map((pago: { valor: number }) => pago.valor)).toEqual([
        3000, 2000, 1000,
      ]);
      for (const pago of body.items) {
        expect(Object.keys(pago).sort()).toEqual(CLAVES_DE_UN_PAGO);
        expect(pago.tarjetaId).toBe(visa);
        for (const prohibida of CLAVES_PROHIBIDAS_DEL_PAGO)
          expect(pago).not.toHaveProperty(prohibida);
      }
    });

    it('CA-RF32-36 solo los pagos de esa tarjeta', async () => {
      const visa = await e.sembrarTarjeta();
      const debito = await e.sembrarTarjeta({ nombre: 'Débito' });
      const visaDeB = await e.sembrarTarjeta(
        { nombre: 'Visa' },
        OTRO_USUARIO_ID,
      );
      const propio = await e.crearPago(visa, e.pagoBase());
      expect(propio.status).toBe(201);
      await e.sembrarPagoCon(debito);
      await e.sembrarPagoCon(visaDeB, {}, OTRO_USUARIO_ID);
      await e.sembrarTransaccion({
        tipo: 'INGRESO',
        monto: 500000,
        categoriaId: null,
        metodoPago: 'EFECTIVO',
        clasificacionFlujo: 'DINERO_RECIBIDO',
        tarjetaId: visa,
      });
      await e.sembrarTransaccion();
      await e.sembrarTransaccion({
        categoriaId: null,
        clasificacionFlujo: 'ABONO_DEUDA',
        deudaId: '665f1c2e9b1d4a0012ab3499',
      });

      const { status, body } = await e.listarPagos(visa);

      expect(status).toBe(200);
      expect(body.items.map((pago: { id: string }) => pago.id)).toEqual([
        propio.body.id,
      ]);
    });

    it('CA-RF32-37 el filtro por mes deja solo los pagos de ese mes', async () => {
      const visa = await e.sembrarTarjeta();
      for (const fecha of ['2026-11-30', '2026-12-05', '2027-01-01']) {
        expect((await e.crearPago(visa, e.pagoBase({ fecha }))).status).toBe(
          201,
        );
      }

      const { status, body } = await e.listarPagos(visa, 'mes=2026-12');

      expect(status).toBe(200);
      expect(body.items.map((pago: { fecha: string }) => pago.fecha)).toEqual([
        '2026-12-05',
      ]);
    });

    it.each(['mes=2026-13', 'mes=2026-1', 'mes=', 'mes=2026-12&mes=2027-01'])(
      'CA-RF32-37 la consulta «%s» responde 400 con un texto que empieza por mes',
      async (consulta) => {
        const visa = await e.sembrarTarjeta();

        const { status, body } = await e.listarPagos(visa, consulta);

        expect(status).toBe(400);
        expect(Array.isArray(body.message)).toBe(true);
        expect(mensajeDeCampo(body, 'mes')).toBe(true);
      },
    );

    it('CA-RF32-37 un parámetro no declarado responde 400', async () => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.listarPagos(visa, 'mes=2026-12&foo=1');

      expect(status).toBe(400);
      expect(mensajeMencionaCampo(body, 'foo')).toBe(true);
    });

    it('CA-RF32-38 sin pagos: lista vacía', async () => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.listarPagos(visa);

      expect(status).toBe(200);
      expect(body).toEqual({ items: [] });
    });

    it('CA-RF32-39 la lista exige sesión y una tarjeta propia', async () => {
      const visa = await e.sembrarTarjeta();
      const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
      await e.sembrarPagoCon(deB, {}, OTRO_USUARIO_ID);

      const ajena = await e.listarPagos(deB);
      const noExiste = await e.listarPagos(INEXISTENTE);
      const malFormada = await e.listarPagos('no-es-un-id');
      const ajenaConMesInvalido = await e.listarPagos(deB, 'mes=2026-13');
      const sinSesion = await e.listarPagos(visa, '', { token: null });

      for (const respuesta of [ajena, noExiste]) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
      }
      expect(malFormada.status).toBe(400);
      expect(mensajeDeCampo(malFormada.body, 'tarjetaId')).toBe(true);
      expect(ajenaConMesInvalido.status).toBe(400);
      expect(mensajeDeCampo(ajenaConMesInvalido.body, 'mes')).toBe(true);
      expect(sinSesion.status).toBe(401);
      expect(sinSesion.body).toEqual(ERROR_401);
    });

    it('CA-RF32-40 listar no guarda nada ni usa la idempotencia', async () => {
      const visa = await e.sembrarTarjeta();
      const creado = await e.crearPago(visa, e.pagoBase(), {
        clave: randomUUID(),
      });
      expect(creado.status).toBe(201);
      const antes = fotografiaTotal(e);
      const antesClaves = e.claves.docs.length;
      vi.stubEnv('IDEMPOTENCIA_OBLIGATORIA', 'true');

      const respuestas = [
        await e.listarPagos(visa),
        await e.listarPagos(visa, '', { clave: randomUUID() }),
        await e.listarPagos(visa, 'mes=2026-12'),
      ];

      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(200);
        expect(respuesta.headers['idempotent-replayed']).toBeUndefined();
        expect(respuesta.body.items).toHaveLength(1);
      }
      expect(respuestas[1].body).toEqual(respuestas[0].body);
      expect(e.claves.docs).toHaveLength(antesClaves);
      expect(fotografiaTotal(e)).toBe(antes);
    });
  });

  describe('Eliminar (DELETE /tarjetas/:tarjetaId/pagos/:id)', () => {
    it('CA-RF32-41 eliminar un pago elimina su transacción y solo la suya', async () => {
      const { visa } = await sembrarEscenarioConAvanceReal(e);
      const primero = await e.crearPago(visa, e.pagoBase(), {
        clave: randomUUID(),
      });
      const segundo = await e.crearPago(visa, e.pagoBase(), {
        clave: randomUUID(),
      });
      expect(primero.status).toBe(201);
      expect(segundo.status).toBe(201);
      const ordinaria = await e.sembrarTransaccion();
      const foto = (docs: Array<Record<string, any>>) => JSON.stringify(docs);
      const delAvance = () =>
        e.transacciones.docs.filter(
          (t) => t.clasificacionFlujo === 'DINERO_RECIBIDO',
        );
      const laOrdinaria = () =>
        e.transacciones.docs.filter((t) => String(t._id) === ordinaria);
      const antesDelAvance = foto(delAvance());
      const antesDeLaOrdinaria = foto(laOrdinaria());
      expect((await e.proyeccion(visa, 'mes=2026-12')).body.pagado).toBe(
        600000,
      );

      const eliminado = await e.eliminarPago(visa, primero.body.id);

      expect(eliminado.status).toBe(204);
      expect(eliminado.text).toBe('');
      expect(pagosGuardados(e).map((doc) => String(doc._id))).toEqual([
        segundo.body.id,
      ]);
      expect(foto(delAvance())).toBe(antesDelAvance);
      expect(foto(laOrdinaria())).toBe(antesDeLaOrdinaria);
      expect((await e.proyeccion(visa, 'mes=2026-12')).body.pagado).toBe(
        300000,
      );

      const repetido = await e.eliminarPago(visa, primero.body.id);

      expect(repetido.status).toBe(404);
      expect(repetido.body).toEqual(error404(MENSAJES.pagoNoEncontrado));
    });

    it('CA-RF32-42 solo se elimina un pago propio de esa tarjeta: 404 en los demás casos', async () => {
      const { visa } = await sembrarEscenarioConAvanceReal(e);
      const debito = await e.sembrarTarjeta({ nombre: 'Débito' });
      const visaDeB = await e.sembrarTarjeta(
        { nombre: 'Visa' },
        OTRO_USUARIO_ID,
      );
      await e.sembrarPagoCon(visa);
      const pagoDeDebito = await e.sembrarPagoCon(debito);
      const pagoDeB = await e.sembrarPagoCon(visaDeB, {}, OTRO_USUARIO_ID);
      const ordinaria = await e.sembrarTransaccion();
      const transaccionDelAvance = String(
        e.transacciones.docs.find(
          (t) => t.clasificacionFlujo === 'DINERO_RECIBIDO',
        )?._id,
      );
      const antes = fotografiaDe(e.transacciones);

      for (const id of [
        INEXISTENTE,
        pagoDeB,
        pagoDeDebito,
        transaccionDelAvance,
        ordinaria,
      ]) {
        const respuesta = await e.eliminarPago(visa, id);

        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(error404(MENSAJES.pagoNoEncontrado));
      }
      expect(fotografiaDe(e.transacciones)).toBe(antes);
    });

    it('CA-RF32-43 tarjeta ajena, ids mal formados y sesión al eliminar', async () => {
      const visa = await e.sembrarTarjeta();
      const visaDeB = await e.sembrarTarjeta(
        { nombre: 'Visa' },
        OTRO_USUARIO_ID,
      );
      const pagoDeB = await e.sembrarPagoCon(visaDeB, {}, OTRO_USUARIO_ID);
      const pagoPropio = await e.sembrarPagoCon(visa);

      const ajena = await e.eliminarPago(visaDeB, pagoDeB);
      const tarjetaInexistente = await e.eliminarPago(INEXISTENTE, pagoDeB);
      const tarjetaMalFormada = await e.eliminarPago('no-es-un-id', pagoPropio);
      const pagoMalFormado = await e.eliminarPago(visa, 'no-es-un-id');
      const sinSesion = await e.eliminarPago(visa, pagoPropio, { token: null });

      for (const respuesta of [ajena, tarjetaInexistente]) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
      }
      expect(tarjetaMalFormada.status).toBe(400);
      expect(mensajeDeCampo(tarjetaMalFormada.body, 'tarjetaId')).toBe(true);
      expect(pagoMalFormado.status).toBe(400);
      expect(mensajeDeCampo(pagoMalFormado.body, 'id')).toBe(true);
      expect(sinSesion.status).toBe(401);
      expect(sinSesion.body).toEqual(ERROR_401);
      expect(
        pagosGuardados(e)
          .map((doc) => String(doc._id))
          .sort(),
      ).toEqual([pagoDeB, pagoPropio].sort());
    });
  });
});
