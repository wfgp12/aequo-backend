import mongoose from 'mongoose';
import { cerca, type Doc, OTRO_USUARIO_ID, usarEntornoEvolucion } from '../../test/reportes/arnes-evolucion.js';

/**
 * Comparación entre periodos (RF-15 y RF-16, paquete 3.1.4): `GET /reportes/comparacion`. Integración con el guard de
 * sesión real y MongoDB simulado. Criterios en `criterios/03-reportes-comparacion-evolucion.md` (CA-RF15-01 a
 * CA-RF15-16 y CA-RF16-01 a CA-RF16-08). Los «datos base» son los de ese archivo.
 */
describe('GET /reportes/comparacion (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntornoEvolucion();

  const MENSAJE_TIPO = 'tipo debe ser uno de: balance, ingresos-egresos, categoria';
  const TIPOS = ['balance', 'ingresos-egresos', 'categoria'] as const;
  const MESES_BASE = ['2026-07', '2026-09', '2026-10'];

  const meses = (body: Doc) => body.periodos.map((p: Doc) => p.periodo);
  const empiezaPor = (body: Doc, texto: string) => body.message.some((m: string) => m.startsWith(texto));

  describe('RF-15 comparar entre todos los periodos con movimientos', () => {
    it('CA-RF15-01 sin parámetros: todos los meses con movimientos, del más antiguo al más reciente', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.comparacion('tipo=balance');

      expect(status).toBe(200);
      expect(body.tipo).toBe('balance');
      expect(body.desde).toBe('2026-07');
      expect(body.hasta).toBe('2026-10');
      expect(meses(body)).toEqual(MESES_BASE);
      expect(body.periodos[0].balance).toBe(2_000_000);
      cerca(body.periodos[1].balance, 1_780_197.87);
      expect(body.periodos[2].balance).toBe(1_245_300);
    });

    it('CA-RF15-02 un usuario sin movimientos recibe una lista vacía', async () => {
      entorno.sembrarDatosBase(OTRO_USUARIO_ID);

      const { status, body } = await entorno.comparacion('tipo=balance');

      expect(status).toBe(200);
      expect(body).toEqual({ tipo: 'balance', desde: null, hasta: null, periodos: [] });
    });

    it('CA-RF15-03 un solo mes con movimientos', async () => {
      entorno.ingreso('2026-10-05', 500_000);

      const { status, body } = await entorno.comparacion('tipo=balance');

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-10');
      expect(body.hasta).toBe('2026-10');
      expect(body.periodos).toEqual([{ periodo: '2026-10', balance: 500_000 }]);
    });

    it('CA-RF15-04 un mes con cualquier clase de movimiento cuenta como mes con movimientos', async () => {
      entorno.ingreso('2026-10-05', 1000);
      entorno.dineroRecibido('2026-11-08', 500_000);
      entorno.pagoTarjeta('2026-12-09', 100_000);

      const { status, body } = await entorno.comparacion('tipo=balance');

      expect(status).toBe(200);
      expect(body.periodos).toEqual([
        { periodo: '2026-10', balance: 1000 },
        { periodo: '2026-11', balance: 0 },
        { periodo: '2026-12', balance: -100_000 },
      ]);
    });

    it('CA-RF15-05 un rango con ambos extremos incluidos', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.comparacion('tipo=balance&desde=2026-09&hasta=2026-10');

      expect(status).toBe(200);
      expect(body.desde).toBe('2026-09');
      expect(body.hasta).toBe('2026-10');
      expect(meses(body)).toEqual(['2026-09', '2026-10']);
    });

    it('CA-RF15-06 con un extremo abierto, se toma el primer o el último mes con movimientos', async () => {
      entorno.sembrarDatosBase();

      const soloDesde = await entorno.comparacion('tipo=balance&desde=2026-09');
      const soloHasta = await entorno.comparacion('tipo=balance&hasta=2026-09');

      expect(soloDesde.status).toBe(200);
      expect(meses(soloDesde.body)).toEqual(['2026-09', '2026-10']);
      expect([soloDesde.body.desde, soloDesde.body.hasta]).toEqual(['2026-09', '2026-10']);
      expect(soloHasta.status).toBe(200);
      expect(meses(soloHasta.body)).toEqual(['2026-07', '2026-09']);
      expect([soloHasta.body.desde, soloHasta.body.hasta]).toEqual(['2026-07', '2026-09']);
    });

    it('CA-RF15-07 un rango sin movimientos es una lista vacía, no un error', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.comparacion('tipo=balance&desde=2026-11&hasta=2026-12');

      expect(status).toBe(200);
      expect(body).toEqual({ tipo: 'balance', desde: '2026-11', hasta: '2026-12', periodos: [] });
    });

    it('CA-RF15-08 los meses se separan por el día calendario', async () => {
      for (const fecha of ['2026-08-31', '2026-09-01', '2026-12-31', '2027-01-01', '2028-02-29', '2028-03-01']) {
        entorno.ingreso(fecha, 1000);
      }

      const { status, body } = await entorno.comparacion('tipo=balance');

      expect(status).toBe(200);
      expect(body.periodos).toEqual(
        ['2026-08', '2026-09', '2026-12', '2027-01', '2028-02', '2028-03'].map((periodo) => ({ periodo, balance: 1000 })),
      );
    });

    it('CA-RF15-09 desde posterior a hasta responde 400 con el mensaje de /reportes/periodo', async () => {
      const { status, body } = await entorno.comparacion('tipo=balance&desde=2026-10&hasta=2026-09');

      expect(status).toBe(400);
      expect(body.message).toContain('desde no puede ser posterior a hasta');
    });

    it.each(['2026-13', '2026-00', '2026-9', 'octubre', '2026-10-01'])(
      'CA-RF15-09 un desde con formato inválido (%s) responde 400 con un mensaje que empieza por desde',
      async (valor) => {
        const { status, body } = await entorno.comparacion(`tipo=balance&desde=${valor}`);

        expect(status).toBe(400);
        expect(empiezaPor(body, 'desde')).toBe(true);
      },
    );

    it.each(['2026-13', '2026-00', '2026-9', 'octubre', '2026-10-01'])(
      'CA-RF15-09 un hasta con formato inválido (%s) responde 400 con un mensaje que empieza por hasta',
      async (valor) => {
        const { status, body } = await entorno.comparacion(`tipo=balance&hasta=${valor}`);

        expect(status).toBe(400);
        expect(empiezaPor(body, 'hasta')).toBe(true);
      },
    );

    it('CA-RF15-10 un rango de 121 meses responde 400 y uno de 120 meses responde 200', async () => {
      entorno.ingreso('2026-10-01', 1000);

      const largo = await entorno.comparacion('tipo=balance&desde=2016-12&hasta=2026-12');
      const limite = await entorno.comparacion('tipo=balance&desde=2017-01&hasta=2026-12');

      expect(largo.status).toBe(400);
      expect(empiezaPor(largo.body, 'el rango no puede abarcar más de 120 meses')).toBe(true);
      expect(limite.status).toBe(200);
      expect(limite.body.periodos).toEqual([{ periodo: '2026-10', balance: 1000 }]);
    });

    it('CA-RF15-10 con extremos abiertos, un rango efectivo de más de 120 meses también responde 400', async () => {
      entorno.ingreso('2010-01-10', 1000);
      entorno.ingreso('2026-10-10', 1000);

      const { status, body } = await entorno.comparacion('tipo=balance');

      expect(status).toBe(400);
      expect(empiezaPor(body, 'el rango no puede abarcar más de 120 meses')).toBe(true);
    });

    it.each(['mes=2026-10', 'zona=UTC', 'foo=1'])('CA-RF15-11 el parámetro desconocido %s responde 400', async (extra) => {
      const { status } = await entorno.comparacion(`tipo=balance&${extra}`);

      expect(status).toBe(400);
    });

    it.each(TIPOS)('CA-RF15-12 solo cuenta lo del usuario de la sesión (tipo %s)', async (tipo) => {
      entorno.sembrarDatosBase();
      const personalDelOtro = entorno.categoria('Mascotas', 'EGRESO', OTRO_USUARIO_ID);
      entorno.ingreso('2026-05-10', 9_000_000, OTRO_USUARIO_ID);
      entorno.ingreso('2026-09-10', 9_000_000, OTRO_USUARIO_ID);
      entorno.egreso('2026-09-11', 7_000_000, OTRO_USUARIO_ID, personalDelOtro);
      entorno.egreso('2026-10-11', 7_000_000, OTRO_USUARIO_ID, entorno.hogar);

      const { status, body } = await entorno.comparacion(`tipo=${tipo}`);

      expect(status).toBe(200);
      expect(meses(body)).toEqual(MESES_BASE);
      expect(body.desde).toBe('2026-07');
      if (tipo === 'balance') cerca(body.periodos[1].balance, 1_780_197.87);
      if (tipo === 'ingresos-egresos') {
        expect(body.periodos[1].ingresos).toBe(3_000_000);
        expect(body.periodos[1].egresos).toBe(900_000);
      }
      if (tipo === 'categoria') {
        expect(body.periodos[1].total).toBe(900_000);
        expect(body.periodos[1].categorias.map((c: Doc) => c.nombre)).toEqual(['Alimentación', 'Transporte']);
        expect(body.periodos[2].categorias.map((c: Doc) => c.nombre)).toEqual(['Alimentación']);
      }
    });

    it('CA-RF15-13 las cifras de cada mes coinciden con los reportes del mes', async () => {
      entorno.sembrarDatosBase();
      const balance = await entorno.comparacion('tipo=balance');
      const ingresosEgresos = await entorno.comparacion('tipo=ingresos-egresos');
      const porCategoria = await entorno.comparacion('tipo=categoria');

      expect(meses(balance.body)).toEqual(MESES_BASE);
      for (const [i, mes] of MESES_BASE.entries()) {
        const resumen = (await entorno.periodo(`mes=${mes}`)).body;
        const categorias = (await entorno.reporteCategorias(`mes=${mes}`)).body;

        cerca(balance.body.periodos[i].balance, resumen.balance);
        cerca(ingresosEgresos.body.periodos[i].ingresos, resumen.ingresos);
        cerca(ingresosEgresos.body.periodos[i].egresos, resumen.egresos);
        const del = porCategoria.body.periodos[i];
        cerca(del.total, categorias.total);
        expect(del.categorias.map((c: Doc) => [c.categoriaId, c.nombre])).toEqual(
          categorias.categorias.map((c: Doc) => [c.categoriaId, c.nombre]),
        );
        for (const [j, c] of del.categorias.entries()) {
          cerca(c.total, categorias.categorias[j].total);
          cerca(c.porcentaje, categorias.categorias[j].porcentaje);
        }
      }
    });

    it('CA-RF15-14 precisión completa, sin redondear', async () => {
      entorno.ingreso('2026-10-01', 1000);
      entorno.egreso('2026-10-02', 100.1);
      entorno.egreso('2026-10-03', 200.2);

      const ingresosEgresos = await entorno.comparacion('tipo=ingresos-egresos');
      const balance = await entorno.comparacion('tipo=balance');

      expect(ingresosEgresos.body.periodos).toHaveLength(1);
      expect(ingresosEgresos.body.periodos[0].ingresos).toBe(1000);
      cerca(ingresosEgresos.body.periodos[0].egresos, 300.3);
      expect(Number.isInteger(ingresosEgresos.body.periodos[0].egresos)).toBe(false);
      cerca(balance.body.periodos[0].balance, 699.7);
    });

    it('CA-RF15-15 los cambios se reflejan al consultar, sin datos guardados que se queden viejos', async () => {
      entorno.egreso('2026-10-05', 45_000);
      const antes = await entorno.comparacion('tipo=balance');

      const ingreso = await entorno.crearPorApi({
        tipo: 'INGRESO',
        monto: 10_000,
        fecha: '2026-12-10',
        categoriaId: entorno.categoriaIngreso._id.toString(),
        metodoPago: 'EFECTIVO',
      });
      const trasCrear = await entorno.comparacion('tipo=balance');

      await entorno.eliminarPorApi(ingreso.body.id);
      const trasEliminar = await entorno.comparacion('tipo=balance');

      expect(ingreso.status).toBe(201);
      expect(antes.body.periodos).toEqual([{ periodo: '2026-10', balance: -45_000 }]);
      expect(trasCrear.body.hasta).toBe('2026-12');
      expect(trasCrear.body.periodos).toEqual([
        { periodo: '2026-10', balance: -45_000 },
        { periodo: '2026-12', balance: 10_000 },
      ]);
      expect(trasEliminar.body.hasta).toBe('2026-10');
      expect(trasEliminar.body.periodos).toEqual([{ periodo: '2026-10', balance: -45_000 }]);
    });

    it('CA-RF15-16 sin sesión válida responde 401', async () => {
      const sinToken = await entorno.comparacion('tipo=balance', { token: null });
      const invalido = await entorno.comparacion('tipo=balance', { token: 'token-manipulado' });

      expect(sinToken.status).toBe(401);
      expect(invalido.status).toBe(401);
    });
  });

  describe('RF-16 tipo de dato de la comparación', () => {
    it('CA-RF16-01 tipo balance: periodo y balance, con las reglas de ADR-014', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.comparacion('tipo=balance');

      expect(status).toBe(200);
      expect(body.tipo).toBe('balance');
      for (const periodo of body.periodos) expect(Object.keys(periodo).sort()).toEqual(['balance', 'periodo']);
      expect(body.periodos[0].balance).toBe(2_000_000);
      cerca(body.periodos[1].balance, 3_000_000 - 900_000 - 119_802.13 - 200_000);
      expect(body.periodos[2].balance).toBe(1_245_300);
    });

    it('CA-RF16-02 tipo ingresos-egresos: ingreso y gasto propios de cada mes', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.comparacion('tipo=ingresos-egresos');

      expect(status).toBe(200);
      expect(body.tipo).toBe('ingresos-egresos');
      for (const periodo of body.periodos) {
        expect(Object.keys(periodo).sort()).toEqual(['egresos', 'ingresos', 'periodo']);
      }
      expect(body.periodos.map((p: Doc) => [p.periodo, p.ingresos, p.egresos])).toEqual([
        ['2026-07', 3_000_000, 1_000_000],
        ['2026-09', 3_000_000, 900_000],
        ['2026-10', 2_500_000, 1_254_700],
      ]);
    });

    it('CA-RF16-03 tipo categoria: total y distribución de cada mes, como /reportes/categorias', async () => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.comparacion('tipo=categoria');
      const { hogar, alimentacion, transporte } = entorno;

      expect(status).toBe(200);
      expect(body.tipo).toBe('categoria');
      for (const periodo of body.periodos) expect(Object.keys(periodo).sort()).toEqual(['categorias', 'periodo', 'total']);
      const [julio, septiembre, octubre] = body.periodos;
      expect(julio.total).toBe(1_000_000);
      expect(julio.categorias).toEqual([
        { categoriaId: hogar._id.toString(), nombre: 'Hogar', total: 1_000_000, porcentaje: 100 },
      ]);
      expect(septiembre.total).toBe(900_000);
      expect(septiembre.categorias.map((c: Doc) => [c.categoriaId, c.nombre, c.total])).toEqual([
        [alimentacion._id.toString(), 'Alimentación', 600_000],
        [transporte._id.toString(), 'Transporte', 300_000],
      ]);
      cerca(septiembre.categorias[0].porcentaje, 66.6667);
      cerca(septiembre.categorias[1].porcentaje, 33.3333);
      expect(octubre.total).toBe(1_254_700);
      expect(octubre.categorias).toEqual([
        { categoriaId: alimentacion._id.toString(), nombre: 'Alimentación', total: 1_254_700, porcentaje: 100 },
      ]);
    });

    it('CA-RF16-04 tipo categoria en un mes con movimientos pero sin gastos', async () => {
      entorno.egreso('2026-10-05', 1000, undefined, entorno.hogar);
      entorno.ingreso('2026-11-05', 100_000);

      const { status, body } = await entorno.comparacion('tipo=categoria');

      expect(status).toBe(200);
      expect(body.periodos[1]).toEqual({ periodo: '2026-11', total: 0, categorias: [] });
    });

    it('CA-RF16-05 tipo categoria: el gasto sin categoría encontrada no se pierde', async () => {
      entorno.egreso('2026-10-05', 70_000, undefined, entorno.hogar);
      entorno.egreso('2026-10-06', 30_000, undefined, { _id: new mongoose.Types.ObjectId() });

      const { status, body } = await entorno.comparacion('tipo=categoria');

      expect(status).toBe(200);
      expect(body.periodos).toHaveLength(1);
      expect(body.periodos[0].total).toBe(100_000);
      expect(body.periodos[0].categorias.map((c: Doc) => [c.categoriaId, c.nombre, c.total])).toEqual([
        [entorno.hogar._id.toString(), 'Hogar', 70_000],
        [null, 'Sin categoría', 30_000],
      ]);
    });

    it.each(['', 'tipo=', 'tipo=gastos', 'tipo=BALANCE', 'tipo=metodo-pago'])(
      'CA-RF16-06 el tipo faltante o no soportado (%j) responde 400 con el mensaje del tipo',
      async (consulta) => {
        entorno.sembrarDatosBase();

        const { status, body } = await entorno.comparacion(consulta);

        expect(status).toBe(400);
        expect(body.message).toContain(MENSAJE_TIPO);
      },
    );

    it('CA-RF16-07 cambiar el tipo no cambia los meses comparados', async () => {
      entorno.sembrarDatosBase();
      entorno.ingreso('2026-12-05', 100_000);

      const respuestas = await Promise.all(
        TIPOS.map((tipo) => entorno.comparacion(`tipo=${tipo}&desde=2026-07&hasta=2026-12`)),
      );

      for (const { status, body } of respuestas) {
        expect(status).toBe(200);
        expect(meses(body)).toEqual(['2026-07', '2026-09', '2026-10', '2026-12']);
        expect([body.desde, body.hasta]).toEqual(['2026-07', '2026-12']);
      }
    });

    it.each(TIPOS)('CA-RF16-08 la respuesta del tipo %s tiene exactamente las propiedades acordadas', async (tipo) => {
      entorno.sembrarDatosBase();

      const { status, body } = await entorno.comparacion(`tipo=${tipo}`);
      const vacia = await entorno.comparacion(`tipo=${tipo}`, { token: entorno.tokenOtro });

      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(['desde', 'hasta', 'periodos', 'tipo']);
      expect(body.tipo).toBe(tipo);
      expect(body.desde).toMatch(/^\d{4}-\d{2}$/);
      expect(body.hasta).toMatch(/^\d{4}-\d{2}$/);
      for (const periodo of body.periodos) {
        expect(periodo.periodo).toMatch(/^\d{4}-\d{2}$/);
        for (const [clave, valor] of Object.entries(periodo)) {
          if (clave !== 'periodo' && clave !== 'categorias') expect(typeof valor).toBe('number');
        }
      }
      expect(vacia.body).toEqual({ tipo, desde: null, hasta: null, periodos: [] });
    });
  });
});
