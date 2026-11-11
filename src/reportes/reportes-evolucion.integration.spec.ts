import { cerca, type Doc, OTRO_USUARIO_ID, usarEntornoEvolucion } from '../../test/reportes/arnes-evolucion.js';

/**
 * Evolución del balance mes a mes (RF-19, paquete 3.1.3): `GET /reportes/evolucion`. Integración con el guard de sesión
 * real y MongoDB simulado. Criterios en `criterios/03-reportes-comparacion-evolucion.md` (CA-RF19-01 a CA-RF19-17).
 */
describe('GET /reportes/evolucion (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntornoEvolucion();

  /** Los meses de la serie, en el orden en que llegan. */
  const meses = (body: Doc) => body.puntos.map((punto: Doc) => punto.periodo);
  const balances = (body: Doc) => body.puntos.map((punto: Doc) => punto.balance);

  describe('la serie: un punto por mes del rango', () => {
    it('CA-RF19-01 un punto por mes del rango, con los meses vacíos en cero', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.evolucion();

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-07');
      expect(body.hasta).toBe('2026-10');
      expect(meses(body)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
      expect(body.puntos[0].balance).toBe(2_000_000);
      expect(body.puntos[1].balance).toBe(0);
      cerca(body.puntos[2].balance, 1_780_197.87);
      expect(body.puntos[3].balance).toBe(1_245_300);
    });

    it('CA-RF19-02 un solo mes', async () => {
      entorno.ingreso('2026-10-05', 500_000);

      const { status, body } = await entorno.evolucion();

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-10');
      expect(body.hasta).toBe('2026-10');
      expect(body.puntos).toEqual([{ periodo: '2026-10', balance: 500_000 }]);
    });

    it('CA-RF19-03 un balance negativo no se trunca', async () => {
      entorno.ingreso('2026-10-05', 100_000);
      entorno.egreso('2026-10-06', 350_000);

      const { body } = await entorno.evolucion();

      expect(body.puntos).toEqual([{ periodo: '2026-10', balance: -250_000 }]);
    });

    it('CA-RF19-04 la serie cruza el cambio de año', async () => {
      entorno.ingreso('2026-11-10', 1000);
      entorno.ingreso('2027-02-10', 2000);

      const { status, body } = await entorno.evolucion();

      expect(status).toBe(200);
      expect(meses(body)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
      expect(balances(body)).toEqual([1000, 0, 0, 2000]);
    });
  });

  describe('el rango', () => {
    it('CA-RF19-05 un rango explícito más amplio que los datos rellena los extremos con cero', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.evolucion('desde=2026-05&hasta=2026-11');

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-05');
      expect(body.hasta).toBe('2026-11');
      expect(meses(body)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
      expect([0, 1, 3, 6].map((i) => body.puntos[i].balance)).toEqual([0, 0, 0, 0]);
      expect(body.puntos[2].balance).toBe(2_000_000);
      expect(body.puntos[5].balance).toBe(1_245_300);
    });

    it('CA-RF19-06 con un extremo abierto, se toma el primer o el último mes con movimientos', async () => {
      entorno.sembrarDatosBase();

      const soloDesde = await entorno.evolucion('desde=2026-09');
      const soloHasta = await entorno.evolucion('hasta=2026-08');

      expect(soloDesde.status).toBe(200);
      expect(meses(soloDesde.body)).toEqual(['2026-09', '2026-10']);
      expect([soloDesde.body.desde, soloDesde.body.hasta]).toEqual(['2026-09', '2026-10']);
      expect(soloHasta.status).toBe(200);
      expect(meses(soloHasta.body)).toEqual(['2026-07', '2026-08']);
      expect([soloHasta.body.desde, soloHasta.body.hasta]).toEqual(['2026-07', '2026-08']);
    });

    it('CA-RF19-07 un rango sin movimientos es un estado vacío, no un error', async () => {
      entorno.sembrarDatosBase();

      const despues = await entorno.evolucion('desde=2026-11&hasta=2026-12');
      const antes = await entorno.evolucion('desde=2025-01&hasta=2025-06');

      expect(despues.status).toBe(200);
      expect(despues.body).toEqual({ desde: '2026-11', hasta: '2026-12', puntos: [] });
      expect(antes.status).toBe(200);
      expect(antes.body).toEqual({ desde: '2025-01', hasta: '2025-06', puntos: [] });
    });

    it('CA-RF19-08 un usuario sin movimientos recibe una serie vacía', async () => {
      entorno.sembrarDatosBase(OTRO_USUARIO_ID);

      const { status, body } = await entorno.evolucion();

      expect(status).toBe(200);
      expect(body).toEqual({ desde: null, hasta: null, puntos: [] });
    });

    it('CA-RF19-09 el mes actual no se agrega a la serie, con o sin X-Zona-Horaria', async () => {
      entorno.hoyEs('2026-11-15T12:00:00.000Z');
      entorno.sembrarDatosBase();

      const conZona = await entorno.evolucion('', { zona: 'America/Bogota' });
      const sinZona = await entorno.evolucion();

      for (const { status, body } of [conZona, sinZona]) {
        expect(status).toBe(200);
        expect(body.hasta).toBe('2026-10');
        expect(meses(body)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
      }
    });
  });

  describe('las cifras', () => {
    it('CA-RF19-10 el balance de cada mes coincide con el resumen del mes (ADR-014)', async () => {
      entorno.sembrarDatosBase();

      const { body } = await entorno.evolucion();

      expect(body.puntos).toHaveLength(4);
      for (const punto of body.puntos) {
        const resumen = await entorno.periodo(`mes=${punto.periodo}`);
        expect(resumen.status).toBe(200);
        cerca(punto.balance, resumen.body.balance);
      }
      // El pago de tarjeta y el abono restan; el préstamo no suma.
      cerca(body.puntos[2].balance, 3_000_000 - 900_000 - 119_802.13 - 200_000);
    });

    it('CA-RF19-11 los meses se separan por el día calendario', async () => {
      for (const fecha of ['2026-08-31', '2026-09-01', '2028-02-29', '2028-03-01']) entorno.ingreso(fecha, 1000);

      const normal = await entorno.evolucion('desde=2026-08&hasta=2026-09');
      const bisiesto = await entorno.evolucion('desde=2028-02&hasta=2028-03');

      expect(normal.body.puntos).toEqual([
        { periodo: '2026-08', balance: 1000 },
        { periodo: '2026-09', balance: 1000 },
      ]);
      expect(bisiesto.body.puntos).toEqual([
        { periodo: '2028-02', balance: 1000 },
        { periodo: '2028-03', balance: 1000 },
      ]);
    });

    it('CA-RF19-12 precisión completa, sin redondear', async () => {
      entorno.ingreso('2026-10-01', 1000);
      entorno.egreso('2026-10-02', 100.1);
      entorno.egreso('2026-10-03', 200.2);

      const { body } = await entorno.evolucion();

      expect(body.puntos).toHaveLength(1);
      cerca(body.puntos[0].balance, 699.7);
      expect(Number.isInteger(body.puntos[0].balance)).toBe(false);
    });
  });

  describe('validación y alcance', () => {
    it('CA-RF19-13 desde posterior a hasta responde 400 con el mensaje de /reportes/periodo', async () => {
      const { status, body } = await entorno.evolucion('desde=2026-10&hasta=2026-09');

      expect(status).toBe(400);
      expect(body.message).toContain('desde no puede ser posterior a hasta');
    });

    it.each(['2026-13', '2026-00', '2026-9', 'octubre', '2026-10-01'])(
      'CA-RF19-13 un desde con formato inválido (%s) responde 400 con un mensaje que empieza por desde',
      async (valor) => {
        const { status, body } = await entorno.evolucion(`desde=${valor}`);

        expect(status).toBe(400);
        expect(body.message.some((m: string) => m.startsWith('desde'))).toBe(true);
      },
    );

    it.each(['2026-13', '2026-9', 'octubre', '2026-10-01'])(
      'CA-RF19-13 un hasta con formato inválido (%s) responde 400 con un mensaje que empieza por hasta',
      async (valor) => {
        const { status, body } = await entorno.evolucion(`hasta=${valor}`);

        expect(status).toBe(400);
        expect(body.message.some((m: string) => m.startsWith('hasta'))).toBe(true);
      },
    );

    it('CA-RF19-13 un rango de 121 meses responde 400 y uno de 120 meses responde 200', async () => {
      entorno.ingreso('2026-10-01', 1000);

      const largo = await entorno.evolucion('desde=2016-12&hasta=2026-12');
      const limite = await entorno.evolucion('desde=2017-01&hasta=2026-12');

      expect(largo.status).toBe(400);
      expect(largo.body.message.some((m: string) => m.startsWith('el rango no puede abarcar más de 120 meses'))).toBe(true);
      expect(limite.status).toBe(200);
      expect(limite.body.puntos).toHaveLength(120);
    });

    it('CA-RF19-13 con extremos abiertos, un rango efectivo de más de 120 meses también responde 400', async () => {
      entorno.ingreso('2010-01-10', 1000);
      entorno.ingreso('2026-10-10', 1000);

      const { status, body } = await entorno.evolucion();

      expect(status).toBe(400);
      expect(body.message.some((m: string) => m.startsWith('el rango no puede abarcar más de 120 meses'))).toBe(true);
    });

    it.each(['mes=2026-10', 'medida=balance', 'foo=1'])(
      'CA-RF19-13 el parámetro desconocido %s responde 400',
      async (consulta) => {
        const { status } = await entorno.evolucion(consulta);

        expect(status).toBe(400);
      },
    );

    it('CA-RF19-14 solo cuenta lo del usuario de la sesión', async () => {
      entorno.sembrarDatosBase();
      const otro = OTRO_USUARIO_ID;
      entorno.ingreso('2026-05-10', 9_000_000, otro);
      entorno.ingreso('2026-09-10', 9_000_000, otro);
      entorno.egreso('2026-12-10', 9_000_000, otro);

      const { status, body } = await entorno.evolucion();

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-07');
      expect(body.hasta).toBe('2026-10');
      expect(meses(body)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
      expect(body.puntos[0].balance).toBe(2_000_000);
      cerca(body.puntos[2].balance, 1_780_197.87);
    });

    it('CA-RF19-15 los cambios se reflejan al consultar, sin datos guardados que se queden viejos', async () => {
      entorno.ingreso('2026-10-05', 100_000);
      const antes = await entorno.evolucion();

      const egreso = await entorno.crearPorApi({
        tipo: 'EGRESO',
        monto: 30_000,
        fecha: '2026-10-10',
        categoriaId: entorno.categoriaEgreso._id.toString(),
        metodoPago: 'EFECTIVO',
      });
      const trasCrear = await entorno.evolucion();

      await entorno.editarPorApi(egreso.body.id, { monto: 40_000 });
      const trasEditar = await entorno.evolucion();

      await entorno.crearPorApi({
        tipo: 'INGRESO',
        monto: 5000,
        fecha: '2026-12-10',
        categoriaId: entorno.categoriaIngreso._id.toString(),
        metodoPago: 'EFECTIVO',
      });
      const trasIngreso = await entorno.evolucion();

      expect(egreso.status).toBe(201);
      expect(antes.body.puntos).toEqual([{ periodo: '2026-10', balance: 100_000 }]);
      expect(trasCrear.body.puntos).toEqual([{ periodo: '2026-10', balance: 70_000 }]);
      expect(trasEditar.body.puntos).toEqual([{ periodo: '2026-10', balance: 60_000 }]);
      expect(trasIngreso.body.puntos).toEqual([
        { periodo: '2026-10', balance: 60_000 },
        { periodo: '2026-11', balance: 0 },
        { periodo: '2026-12', balance: 5000 },
      ]);
    });

    it('CA-RF19-16 sin sesión válida responde 401', async () => {
      const sinToken = await entorno.evolucion('', { token: null });
      const invalido = await entorno.evolucion('', { token: 'token-manipulado' });

      expect(sinToken.status).toBe(401);
      expect(invalido.status).toBe(401);
    });

    it('CA-RF19-17 la respuesta tiene exactamente las propiedades acordadas, con sus tipos', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.evolucion();
      const vacia = await entorno.evolucion('desde=2020-01&hasta=2020-02');

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(['desde', 'hasta', 'puntos']);
      expect(body.desde).toMatch(/^\d{4}-\d{2}$/);
      expect(body.hasta).toMatch(/^\d{4}-\d{2}$/);
      for (const punto of body.puntos) {
        expect(Object.keys(punto).sort()).toEqual(['balance', 'periodo']);
        expect(punto.periodo).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof punto.balance).toBe('number');
      }
      expect(Object.keys(vacia.body).sort()).toEqual(['desde', 'hasta', 'puntos']);
    });
  });
});
