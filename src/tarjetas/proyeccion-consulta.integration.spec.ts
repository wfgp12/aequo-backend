import {
  OTRO_USUARIO_ID,
  cerca,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import {
  TABLA_BASE,
  mesesDe,
  sembrarEscenarioBase,
} from '../../test/tarjetas/escenario-proyeccion.js';

/** Lo que cada 400 debe cumplir: el formato de error de Nest, el mensaje como arreglo y nada calculado. */
const esError400 = (respuesta: { status: number; body: any }) => {
  expect(respuesta.status).toBe(400);
  expect(respuesta.body.statusCode).toBe(400);
  expect(respuesta.body.error).toBe('Bad Request');
  expect(Array.isArray(respuesta.body.message)).toBe(true);
  expect(respuesta.body).not.toHaveProperty('cuotas');
  expect(respuesta.body).not.toHaveProperty('proyeccion');
};

// Con los campos del paquete 5.3.2 (RF-32): `pagado` y `diferencia` en el nivel superior (CA-RF32-34 modifica CA-RF30-18),
// y con el del paquete 5.3.6: `detalle` (CA-RF31-18 lo vuelve a modificar: diez claves).
const CLAVES_NIVEL_SUPERIOR = [
  'cargosFijos',
  'cuotas',
  'detalle',
  'diferencia',
  'mes',
  'pagado',
  'proyeccion',
  'saldoPendiente',
  'tarjetaId',
  'total',
];
const CLAVES_DE_UN_MES = [
  'cargosFijos',
  'cuotas',
  'mes',
  'saldoPendiente',
  'total',
];
const CLAVES_PROHIBIDAS = ['id', '_id', 'usuarioId', '__v'];

// Paquete 5.3.1 (RF-30, RF-31): la consulta: forma de la respuesta, mes de referencia, zona horaria y parámetros.
describe('GET /tarjetas/:tarjetaId/proyeccion: la consulta (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF30-18 la forma exacta de la respuesta (con `pagado` y `diferencia`, CA-RF32-34, y `detalle`, CA-RF31-18)', async () => {
    const { visa } = await sembrarEscenarioBase(e);

    const { status, body } = await e.proyeccion(visa, 'mes=2026-12');

    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(CLAVES_NIVEL_SUPERIOR);
    expect(body.tarjetaId).toBe(visa);
    expect(body.mes).toMatch(/^\d{4}-\d{2}$/);
    expect(body.proyeccion).toHaveLength(11);
    for (const nivel of [body, ...body.proyeccion]) {
      for (const campo of ['cuotas', 'cargosFijos', 'total', 'saldoPendiente'])
        expect(typeof nivel[campo]).toBe('number');
      expect(nivel.mes).toMatch(/^\d{4}-\d{2}$/);
      for (const prohibida of CLAVES_PROHIBIDAS)
        expect(nivel).not.toHaveProperty(prohibida);
    }
    for (const fila of body.proyeccion)
      expect(Object.keys(fila).sort()).toEqual(CLAVES_DE_UN_MES);
  });

  describe('Mes de referencia y zona horaria', () => {
    const esMesDeLaTabla = (body: any, indice: number) => {
      const fila = TABLA_BASE[indice];
      expect(body.mes).toBe(fila.mes);
      cerca(body.cuotas, fila.cuotas, 6);
      cerca(body.total, fila.total, 6);
    };

    it('CA-RF30-19 sin mes, se usa el mes actual en UTC', async () => {
      e.hoyEs('2026-12-15T12:00:00.000Z');
      const { visa } = await sembrarEscenarioBase(e);

      const { status, body } = await e.proyeccion(visa);

      expect(status).toBe(200);
      expect(body.mes).toBe('2026-12');
      esMesDeLaTabla(body, 0);
    });

    it('CA-RF30-20 sin mes, a las 03:00Z del 1 de enero el mes actual depende de X-Zona-Horaria (Bogotá aún es diciembre)', async () => {
      e.hoyEs('2027-01-01T03:00:00.000Z');
      const { visa } = await sembrarEscenarioBase(e);

      const sinHeader = await e.proyeccion(visa);
      const enBogota = await e.proyeccion(visa, '', {
        zona: 'America/Bogota',
      });

      expect(sinHeader.status).toBe(200);
      expect(sinHeader.body.mes).toBe('2027-01');
      expect(enBogota.status).toBe(200);
      expect(enBogota.body.mes).toBe('2026-12');
    });

    it('CA-RF30-20 sin mes, a las 20:00Z del 31 de diciembre el mes actual depende de X-Zona-Horaria (Tokio ya es enero)', async () => {
      e.hoyEs('2026-12-31T20:00:00.000Z');
      const { visa } = await sembrarEscenarioBase(e);

      const sinHeader = await e.proyeccion(visa);
      const enTokio = await e.proyeccion(visa, '', { zona: 'Asia/Tokyo' });

      expect(sinHeader.status).toBe(200);
      expect(sinHeader.body.mes).toBe('2026-12');
      expect(enTokio.status).toBe(200);
      expect(enTokio.body.mes).toBe('2027-01');
    });

    it('CA-RF30-21 con mes, la zona no cambia nada; una zona inválida es 400 siempre', async () => {
      const { visa } = await sembrarEscenarioBase(e);
      const sinHeader = await e.proyeccion(visa, 'mes=2026-12');

      const enTokio = await e.proyeccion(visa, 'mes=2026-12', {
        zona: 'Asia/Tokyo',
      });
      const invalidaConMes = await e.proyeccion(visa, 'mes=2026-12', {
        zona: 'Zona/Invalida',
      });
      const invalidaSinMes = await e.proyeccion(visa, '', {
        zona: 'Zona/Invalida',
      });

      expect(enTokio.status).toBe(200);
      expect(enTokio.body).toEqual(sinHeader.body);
      for (const respuesta of [invalidaConMes, invalidaSinMes]) {
        esError400(respuesta);
        expect(mensajeDeCampo(respuesta.body, 'X-Zona-Horaria')).toBe(true);
      }
    });

    const mesesInvalidos = [
      '2026-13',
      '2026-00',
      '2026-1',
      '202612',
      '2026-12-01',
      'diciembre',
      '',
      ' 2026-12',
    ];

    it.each(mesesInvalidos)(
      'CA-RF30-22 rechaza mes="%s" con 400 y un texto que empieza por mes',
      async (mes) => {
        const { visa } = await sembrarEscenarioBase(e);

        const respuesta = await e.proyeccion(
          visa,
          `mes=${encodeURIComponent(mes)}`,
        );

        esError400(respuesta);
        expect(mensajeDeCampo(respuesta.body, 'mes')).toBe(true);
      },
    );

    it('CA-RF30-23 un mes muy pasado o muy futuro es válido y no tiene tope', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const pasado = await e.proyeccion(visa, 'mes=2020-01');
      const futuro = await e.proyeccion(visa, 'mes=2099-12');

      expect(pasado.status).toBe(200);
      expect(pasado.body.cuotas).toBe(0);
      expect(pasado.body.cargosFijos).toBe(55000);
      cerca(pasado.body.saldoPendiente, 2057798.940366);
      expect(pasado.body.proyeccion).toHaveLength(94);
      expect(
        pasado.body.proyeccion.map((fila: { mes: string }) => fila.mes),
      ).toEqual(mesesDe('2020-02', '2027-11'));
      expect(futuro.status).toBe(200);
      expect(futuro.body.cuotas).toBe(0);
      expect(futuro.body.total).toBe(55000);
      expect(futuro.body.saldoPendiente).toBe(0);
      expect(futuro.body.proyeccion).toEqual([]);
    });
  });

  describe('Parámetros', () => {
    it('CA-RF30-24 un mes repetido se rechaza', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const respuesta = await e.proyeccion(visa, 'mes=2026-12&mes=2027-01');

      esError400(respuesta);
      expect(mensajeDeCampo(respuesta.body, 'mes')).toBe(true);
    });

    const noDeclarados: Array<[string, string]> = [
      ['desde', '2026-12'],
      ['hasta', '2027-11'],
      ['periodo', '2026-12'],
      ['tasaEA', '0.5'],
      ['tasaEAAplicada', '0.5'],
      ['usuarioId', OTRO_USUARIO_ID],
      ['tarjetaId', '665f1c2e9b1d4a0012ab34ee'],
      ['foo', '1'],
    ];

    it.each(noDeclarados)(
      'CA-RF30-25 el parámetro no declarado %s responde 400 y el texto menciona su nombre',
      async (parametro, valor) => {
        const { visa } = await sembrarEscenarioBase(e);

        const respuesta = await e.proyeccion(
          visa,
          `mes=2026-12&${parametro}=${encodeURIComponent(valor)}`,
        );

        // El ValidationPipe estricto de Nest redacta «property <nombre> should not exist»: se verifica que mencione el nombre.
        esError400(respuesta);
        expect(mensajeMencionaCampo(respuesta.body, parametro)).toBe(true);
      },
    );
  });
});
