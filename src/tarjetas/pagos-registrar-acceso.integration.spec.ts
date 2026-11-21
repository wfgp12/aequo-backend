import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import {
  MENSAJES,
  OTRO_USUARIO_ID,
  SECRETO_JWT,
  USUARIO_ID,
  error404,
  mensajeDeCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import { pagosGuardados } from '../../test/tarjetas/escenario-pagos.js';

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

// Paquete 5.3.2 (RF-32): la tarjeta de la ruta, la sesión, la idempotencia y la zona horaria del registro del pago.
describe('POST /tarjetas/:tarjetaId/pagos: tarjeta, sesión, idempotencia y zona (integración)', () => {
  const e = usarEntornoCompras();

  describe('La tarjeta y la sesión', () => {
    it('CA-RF32-20 tarjeta de otro usuario o inexistente: 404; tarjetaId mal formado: 400', async () => {
      const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);

      const ajena = await e.crearPago(deB, e.pagoBase());
      const noExiste = await e.crearPago(
        '665f1c2e9b1d4a0012ab34ee',
        e.pagoBase(),
      );
      const malFormada = await e.crearPago('no-es-un-id', e.pagoBase());

      for (const respuesta of [ajena, noExiste]) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
      }
      expect(e.transacciones.docs).toHaveLength(0);
      expect(malFormada.status).toBe(400);
      expect(mensajeDeCampo(malFormada.body, 'tarjetaId')).toBe(true);
    });

    it('CA-RF32-21 primero se valida el cuerpo y después la tarjeta', async () => {
      const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);

      const invalido = await e.crearPago(deB, e.pagoBase({ valor: 0 }));
      const valido = await e.crearPago(deB, e.pagoBase());

      expect(invalido.status).toBe(400);
      expect(mensajeDeCampo(invalido.body, 'valor')).toBe(true);
      expect(valido.status).toBe(404);
      expect(valido.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
    });

    it.each(sesiones)(
      'CA-RF32-22 la ruta responde 401 %s y no guarda nada',
      async (_caso, obtenerToken) => {
        const visa = await e.sembrarTarjeta();
        const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
        const token = obtenerToken();

        const envios = [
          () => e.crearPago(visa, e.pagoBase(), { token }),
          () => e.crearPago(deB, e.pagoBase(), { token }),
          () => e.crearPago(visa, e.pagoBase({ valor: 0 }), { token }),
        ];
        for (const enviar of envios) {
          const respuesta = await enviar();
          expect(respuesta.status).toBe(401);
          expect(respuesta.body).toEqual(ERROR_401);
        }
        expect(e.transacciones.docs).toHaveLength(0);
      },
    );
  });

  describe('Idempotencia', () => {
    it('CA-RF32-23 repetir con la misma clave de idempotencia no duplica el pago', async () => {
      const visa = await e.sembrarTarjeta();
      const clave = randomUUID();

      const primera = await e.crearPago(visa, e.pagoBase(), { clave });
      const repetida = await e.crearPago(visa, e.pagoBase(), { clave });

      expect(primera.status).toBe(201);
      expect(repetida.status).toBe(201);
      expect(repetida.body).toEqual(primera.body);
      expect(repetida.body.id).toBe(primera.body.id);
      expect(repetida.headers['idempotent-replayed']).toBe('true');
      expect(pagosGuardados(e)).toHaveLength(1);
    });

    it('CA-RF32-24 la misma clave con otra petición se rechaza con 422 y no cambia nada', async () => {
      const visa = await e.sembrarTarjeta();
      const clave = randomUUID();
      const primera = await e.crearPago(visa, e.pagoBase(), { clave });
      expect(primera.status).toBe(201);

      const otroCuerpo = await e.crearPago(visa, e.pagoBase({ valor: 1000 }), {
        clave,
      });

      expect(otroCuerpo.status).toBe(422);
      expect(pagosGuardados(e)).toHaveLength(1);
      expect(pagosGuardados(e)[0].monto).toBe(300000);
    });

    it('CA-RF32-25 dos pagos iguales con claves distintas (o sin clave) son legítimos', async () => {
      const visa = await e.sembrarTarjeta();
      const primero = await e.crearPago(visa, e.pagoBase(), {
        clave: randomUUID(),
      });
      expect(primero.status).toBe(201);

      const segundo = await e.crearPago(visa, e.pagoBase(), {
        clave: randomUUID(),
      });
      const sinClave = await e.crearPago(visa, e.pagoBase());

      expect(segundo.status).toBe(201);
      expect(segundo.body.id).not.toBe(primero.body.id);
      expect(segundo.body.comparacion.pagado).toBe(600000);
      expect(sinClave.status).toBe(201);
      expect(pagosGuardados(e)).toHaveLength(3);
    });

    it('CA-RF32-26 si falla el guardado, no queda nada y la misma clave se puede reintentar', async () => {
      const visa = await e.sembrarTarjeta();
      const clave = randomUUID();
      e.transacciones.fallaEscritura = true;

      const fallida = await e.crearPago(visa, e.pagoBase(), { clave });

      expect(fallida.status).toBe(500);
      expect(e.transacciones.docs).toHaveLength(0);

      e.transacciones.fallaEscritura = false;
      const reintento = await e.crearPago(visa, e.pagoBase(), { clave });

      expect(reintento.status).toBe(201);
      expect(pagosGuardados(e)).toHaveLength(1);
    });

    it('CA-RF32-27 con IDEMPOTENCIA_OBLIGATORIA activada, el header es obligatorio', async () => {
      const visa = await e.sembrarTarjeta();
      vi.stubEnv('IDEMPOTENCIA_OBLIGATORIA', 'true');

      const sinClave = await e.crearPago(visa, e.pagoBase());
      const conClave = await e.crearPago(visa, e.pagoBase(), {
        clave: randomUUID(),
      });

      expect(sinClave.status).toBe(400);
      expect(mensajeDeCampo(sinClave.body, 'Idempotency-Key')).toBe(true);
      expect(conClave.status).toBe(201);
      expect(pagosGuardados(e)).toHaveLength(1);
    });
  });

  describe('Zona horaria', () => {
    it('CA-RF32-28 una zona horaria inválida se rechaza siempre, con o sin fecha', async () => {
      const visa = await e.sembrarTarjeta();
      const { fecha: _fecha, ...sinFecha } = e.pagoBase();

      const conFecha = await e.crearPago(visa, e.pagoBase(), {
        zona: 'Zona/Invalida',
      });
      const sinFechaEnviada = await e.crearPago(visa, sinFecha, {
        zona: 'Zona/Invalida',
      });

      for (const respuesta of [conFecha, sinFechaEnviada]) {
        expect(respuesta.status).toBe(400);
        expect(mensajeDeCampo(respuesta.body, 'X-Zona-Horaria')).toBe(true);
      }
      expect(e.transacciones.docs).toHaveLength(0);
    });
  });
});
