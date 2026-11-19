import { JwtService } from '@nestjs/jwt';
import {
  MENSAJES,
  OTRO_USUARIO_ID,
  SECRETO_JWT,
  USUARIO_ID,
  cerca,
  consultaCuota,
  error404,
  instantanea,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

const ERROR_401 = {
  statusCode: 401,
  message: 'Sesión inválida o vencida',
  error: 'Unauthorized',
};

const sesiones: Array<[string, () => string | null]> = [
  ['sin el header Authorization', () => null],
  [
    'con un token que no emitió este backend',
    () => 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma-falsa',
  ],
  [
    'con un token vencido',
    () =>
      new JwtService({
        secret: SECRETO_JWT,
        signOptions: { algorithm: 'HS256' },
      }).sign({ sub: USUARIO_ID }, { expiresIn: -10 }),
  ],
];

/** Lo que cada tipo de 400 debe cumplir: el formato de error de Nest y nada calculado. */
const esError400 = (respuesta: { status: number; body: any }) => {
  expect(respuesta.status).toBe(400);
  expect(respuesta.body.statusCode).toBe(400);
  expect(respuesta.body.error).toBe('Bad Request');
  expect(Array.isArray(respuesta.body.message)).toBe(true);
  expect(respuesta.body).not.toHaveProperty('cuota');
};

// Paquete 5.2.6 (RF-27): los parámetros de la consulta, la tarjeta de la ruta y la sesión.
describe('GET /tarjetas/:tarjetaId/cuota: parámetros, tarjeta y sesión (integración)', () => {
  const e = usarEntornoCompras();

  describe('Parámetros de la consulta', () => {
    const obligatorios = ['valor', 'cuotas', 'primerPago'];

    it.each(obligatorios)(
      'CA-RF27-53 sin %s responde 400 con un texto que empieza por el parámetro',
      async (parametro) => {
        const visa = await e.sembrarTarjeta();

        const respuesta = await e.vistaPreviaCuota(
          visa,
          consultaCuota({ [parametro]: undefined }),
        );

        esError400(respuesta);
        expect(mensajeDeCampo(respuesta.body, parametro)).toBe(true);
      },
    );

    it('CA-RF27-53 sin ningún parámetro responde 400 con un texto por cada uno', async () => {
      const visa = await e.sembrarTarjeta();

      const respuesta = await e.vistaPreviaCuota(visa);

      esError400(respuesta);
      for (const parametro of obligatorios)
        expect(mensajeDeCampo(respuesta.body, parametro)).toBe(true);
    });

    const valoresInvalidos = [
      '0',
      '0.0',
      '-1',
      '+5',
      'abc',
      '',
      '1e3',
      '0x10',
      '1,5',
      'Infinity',
      'NaN',
      '9'.repeat(400),
    ];

    it.each(valoresInvalidos)(
      'CA-RF27-54 rechaza valor=%s con 400 y un texto que empieza por valor',
      async (valor) => {
        const visa = await e.sembrarTarjeta();

        const respuesta = await e.vistaPreviaCuota(
          visa,
          consultaCuota({ valor }),
        );

        esError400(respuesta);
        expect(mensajeDeCampo(respuesta.body, 'valor')).toBe(true);
      },
    );

    it.each(['1254700', '100.5', '0.01'])(
      'CA-RF27-54 acepta valor=%s',
      async (valor) => {
        const visa = await e.sembrarTarjeta();

        const { status, body } = await e.vistaPreviaCuota(
          visa,
          consultaCuota({ valor }),
        );

        expect(status).toBe(200);
        expect(Number.isFinite(body.cuota)).toBe(true);
        expect(body.cuota).toBeGreaterThan(0);
      },
    );

    const cuotasInvalidas = [
      '0',
      '-1',
      '12.5',
      '61',
      'abc',
      '12a',
      '',
      '1e1',
      'NaN',
    ];

    it.each(cuotasInvalidas)(
      'CA-RF27-55 rechaza cuotas=%s con 400 y un texto que empieza por cuotas',
      async (cuotas) => {
        const visa = await e.sembrarTarjeta();

        const respuesta = await e.vistaPreviaCuota(
          visa,
          consultaCuota({ cuotas }),
        );

        esError400(respuesta);
        expect(mensajeDeCampo(respuesta.body, 'cuotas')).toBe(true);
      },
    );

    it.each(['1', '60'])('CA-RF27-55 acepta cuotas=%s', async (cuotas) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.vistaPreviaCuota(
        visa,
        consultaCuota({ cuotas }),
      );

      expect(status).toBe(200);
      expect(body.cuota).toBeGreaterThan(0);
    });

    const primerPagoInvalidos = [
      'pronto',
      '2026-13',
      '2026-02-30',
      '2026-12-01T00:00:00.000Z',
      '202612',
      '',
    ];

    it.each(primerPagoInvalidos)(
      'CA-RF27-56 rechaza primerPago=%s con 400 y un texto que empieza por primerPago',
      async (primerPago) => {
        const visa = await e.sembrarTarjeta();

        const respuesta = await e.vistaPreviaCuota(
          visa,
          consultaCuota({ primerPago }),
        );

        esError400(respuesta);
        expect(mensajeDeCampo(respuesta.body, 'primerPago')).toBe(true);
      },
    );

    const primerPagoValidos: Array<[string, string]> = [
      ['2026-12', '2027-11'],
      ['2026-12-15', '2027-11'],
      ['2026-01-31', '2026-12'],
      ['2026-02-28', '2027-01'],
      ['2020-01', '2020-12'],
    ];

    it.each(primerPagoValidos)(
      'CA-RF27-57 acepta primerPago=%s con 12 cuotas y da el último pago %s',
      async (primerPago, mesUltimoPago) => {
        const visa = await e.sembrarTarjeta();

        const { status, body } = await e.vistaPreviaCuota(
          visa,
          consultaCuota({ primerPago, cuotas: 12 }),
        );

        expect(status).toBe(200);
        expect(body.mesUltimoPago).toBe(mesUltimoPago);
      },
    );

    it.each(obligatorios)(
      'CA-RF27-58 el parámetro %s repetido responde 400 con un texto que empieza por su nombre',
      async (parametro) => {
        const visa = await e.sembrarTarjeta();
        const repetido: Record<string, string> = {
          valor: 'valor=2000',
          cuotas: 'cuotas=6',
          primerPago: 'primerPago=2027-01',
        };

        const respuesta = await e.vistaPreviaCuota(
          visa,
          `${consultaCuota({ valor: 1000 })}&${repetido[parametro]}`,
        );

        esError400(respuesta);
        expect(mensajeDeCampo(respuesta.body, parametro)).toBe(true);
      },
    );

    const noDeclarados: Array<[string, string]> = [
      ['fecha', '2026-11-10'],
      ['tipo', 'COMPRA'],
      ['tasaEA', '0.5'],
      ['tasaEAAplicada', '0.5'],
      ['cuotaUnicaSinInteres', 'true'],
      ['usuarioId', OTRO_USUARIO_ID],
      ['descripcion', 'Televisor'],
      ['categoriaId', '665f1c2e9b1d4a0012ab34ee'],
      ['foo', '1'],
    ];

    it.each(noDeclarados)(
      'CA-RF27-59 el parámetro no declarado %s responde 400: el cliente no elige la tasa',
      async (parametro, valor) => {
        const visa = await e.sembrarTarjeta({ tasaEA: 0.2921 });

        const respuesta = await e.vistaPreviaCuota(
          visa,
          `${consultaCuota()}&${parametro}=${encodeURIComponent(valor)}`,
        );

        esError400(respuesta);
        expect(mensajeMencionaCampo(respuesta.body, parametro)).toBe(true);
      },
    );

    it('CA-RF27-60 con varios parámetros inválidos responde un texto por cada uno', async () => {
      const visa = await e.sembrarTarjeta();

      const respuesta = await e.vistaPreviaCuota(
        visa,
        'valor=0&cuotas=61&primerPago=pronto',
      );

      esError400(respuesta);
      for (const parametro of obligatorios)
        expect(mensajeDeCampo(respuesta.body, parametro)).toBe(true);
    });
  });

  describe('La tarjeta y la sesión', () => {
    it('CA-RF27-61 tarjeta de otro usuario o inexistente: 404; tarjetaId mal formado: 400', async () => {
      const deB = await e.sembrarTarjeta(
        { nombre: 'Visa', tasaEA: 0.5, cuotaUnicaSinInteres: true },
        OTRO_USUARIO_ID,
      );
      const inexistente = '665f1c2e9b1d4a0012ab34ee';

      const ajena = await e.vistaPreviaCuota(deB, consultaCuota());
      const noExiste = await e.vistaPreviaCuota(inexistente, consultaCuota());
      const malFormada = await e.vistaPreviaCuota(
        'no-es-un-id',
        consultaCuota(),
      );

      // El mismo mensaje y sin ningún dato de la tarjeta ajena (cuota, tasa ni bandera).
      for (const respuesta of [ajena, noExiste]) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
      }
      esError400(malFormada);
      expect(mensajeDeCampo(malFormada.body, 'tarjetaId')).toBe(true);
    });

    it('CA-RF27-62 primero se valida la consulta y después la tarjeta', async () => {
      const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);

      const invalida = await e.vistaPreviaCuota(
        deB,
        consultaCuota({ valor: 0 }),
      );
      const valida = await e.vistaPreviaCuota(deB, consultaCuota());

      esError400(invalida);
      expect(mensajeDeCampo(invalida.body, 'valor')).toBe(true);
      expect(valida.status).toBe(404);
      expect(valida.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
    });

    it('CA-RF27-63 la tarjeta de otro usuario no afecta la cuota del usuario', async () => {
      const deA = await e.sembrarTarjeta(
        { nombre: 'Visa', tasaEA: 0.2921 },
        USUARIO_ID,
      );
      const deB = await e.sembrarTarjeta(
        { nombre: 'Visa', tasaEA: 0.5 },
        OTRO_USUARIO_ID,
      );
      // Cuota con tasa 0,5: V · i / (1 − (1 + i)^(−n)), con i = 1,5^(1/12) − 1.
      const i = 1.5 ** (1 / 12) - 1;
      const cuotaConMitad = (1254700 * i) / (1 - (1 + i) ** -12);

      const deAResp = await e.vistaPreviaCuota(deA, consultaCuota());
      const deBResp = await e.vistaPreviaCuota(deB, consultaCuota(), {
        token: e.tokenOtro,
      });

      expect(deAResp.status).toBe(200);
      cerca(deAResp.body.cuota, 119802.13, 2);
      expect(deAResp.body.tasaEAAplicada).toBe(0.2921);
      expect(deBResp.status).toBe(200);
      cerca(deBResp.body.cuota, cuotaConMitad, 4);
      expect(deBResp.body.tasaEAAplicada).toBe(0.5);
    });

    it.each(sesiones)(
      'CA-RF27-64 la ruta responde 401 %s y no cambia nada',
      async (_caso, obtenerToken) => {
        const visa = await e.sembrarTarjeta();
        const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
        const antes = instantanea(e.tarjetas);
        const token = obtenerToken();

        const consultas: Array<[string, string]> = [
          [visa, consultaCuota()],
          [deB, consultaCuota()],
          [visa, consultaCuota({ valor: 0 })],
        ];
        for (const [tarjetaId, consulta] of consultas) {
          const respuesta = await e.vistaPreviaCuota(tarjetaId, consulta, {
            token,
          });
          expect(respuesta.status).toBe(401);
          expect(respuesta.body).toEqual(ERROR_401);
        }
        expect(instantanea(e.tarjetas)).toEqual(antes);
        expect(e.compras.docs).toHaveLength(0);
      },
    );
  });
});
