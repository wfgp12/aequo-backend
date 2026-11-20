import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import {
  type EntornoCompras,
  MENSAJES,
  OTRO_USUARIO_ID,
  SECRETO_JWT,
  USUARIO_ID,
  cerca,
  error404,
  mensajeDeCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import { sembrarEscenarioBase } from '../../test/tarjetas/escenario-proyeccion.js';

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

/** Todo lo guardado en cada colección, con marcas de tiempo, para comprobar que nada cambió ni siquiera `actualizadaEn`. */
const fotografia = (e: EntornoCompras) =>
  JSON.stringify({
    tarjetas: e.tarjetas.docs,
    cargos: e.cargos.docs,
    compras: e.compras.docs,
    transacciones: e.transacciones.docs,
    categorias: e.categorias.docs,
    claves: e.claves.docs,
  });

// Paquete 5.3.1 (RF-30, RF-31): la tarjeta de la ruta, la sesión y que la consulta no escribe nada.
describe('GET /tarjetas/:tarjetaId/proyeccion: tarjeta, sesión y efectos (integración)', () => {
  const e = usarEntornoCompras();

  describe('La tarjeta y la sesión', () => {
    it('CA-RF30-26 tarjeta de otro usuario o inexistente: 404; tarjetaId mal formado: 400', async () => {
      const { visa: deB } = await sembrarEscenarioBase(e, OTRO_USUARIO_ID);
      const inexistente = '665f1c2e9b1d4a0012ab34ee';

      const ajena = await e.proyeccion(deB, 'mes=2026-12');
      const noExiste = await e.proyeccion(inexistente, 'mes=2026-12');
      const malFormada = await e.proyeccion('no-es-un-id');

      // El mismo mensaje y sin ninguna cifra de la tarjeta ajena.
      for (const respuesta of [ajena, noExiste]) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
      }
      expect(malFormada.status).toBe(400);
      expect(Array.isArray(malFormada.body.message)).toBe(true);
      expect(mensajeDeCampo(malFormada.body, 'tarjetaId')).toBe(true);
    });

    it('CA-RF30-27 primero se valida la consulta y después la tarjeta', async () => {
      const { visa: deB } = await sembrarEscenarioBase(e, OTRO_USUARIO_ID);

      const invalida = await e.proyeccion(deB, 'mes=2026-13');
      const valida = await e.proyeccion(deB, 'mes=2026-12');

      expect(invalida.status).toBe(400);
      expect(mensajeDeCampo(invalida.body, 'mes')).toBe(true);
      expect(valida.status).toBe(404);
      expect(valida.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
    });

    it.each(sesiones)(
      'CA-RF30-28 la ruta responde 401 %s y no calcula nada',
      async (_caso, obtenerToken) => {
        const { visa } = await sembrarEscenarioBase(e);
        const { visa: deB } = await sembrarEscenarioBase(e, OTRO_USUARIO_ID);
        const antes = fotografia(e);
        const token = obtenerToken();

        const consultas: Array<[string, string]> = [
          [visa, 'mes=2026-12'],
          [deB, 'mes=2026-12'],
          [visa, 'mes=2026-13'],
        ];
        for (const [tarjetaId, consulta] of consultas) {
          const respuesta = await e.proyeccion(tarjetaId, consulta, { token });
          expect(respuesta.status).toBe(401);
          expect(respuesta.body).toEqual(ERROR_401);
        }
        expect(fotografia(e)).toBe(antes);
      },
    );
  });

  describe('Sin efectos secundarios', () => {
    it('CA-RF30-29 la consulta no guarda nada y no usa la idempotencia', async () => {
      const { visa } = await sembrarEscenarioBase(e);
      // Datos ya guardados por la API: una compra con su clave de idempotencia, un avance y su transacción.
      await e.crearCompra(visa, e.compraBase(), { clave: randomUUID() });
      await e.crearAvance(visa, e.avanceBase(), { clave: randomUUID() });
      await e.sembrarTransaccion();
      expect(e.transacciones.docs.length).toBeGreaterThan(0);
      expect(e.claves.docs.length).toBeGreaterThan(0);
      const antes = fotografia(e);
      const antesClaves = e.claves.docs.length;

      // Con la clave obligatoria (el servidor la exige a los POST que crean datos) este GET sigue sin pedirla.
      vi.stubEnv('IDEMPOTENCIA_OBLIGATORIA', 'true');
      const respuestas = [
        await e.proyeccion(visa, 'mes=2026-12'),
        await e.proyeccion(visa, 'mes=2026-12', { clave: randomUUID() }),
        await e.proyeccion(visa, 'mes=2027-01'),
        await e.proyeccion(visa),
      ];

      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(200);
        expect(respuesta.headers['idempotent-replayed']).toBeUndefined();
      }
      expect(e.claves.docs).toHaveLength(antesClaves);
      expect(fotografia(e)).toBe(antes);
    });

    it('CA-RF30-30 repetir la consulta da la misma respuesta, y responde aunque la base rechace escrituras', async () => {
      const { visa } = await sembrarEscenarioBase(e);

      const primera = await e.proyeccion(visa, 'mes=2026-12');
      const segunda = await e.proyeccion(visa, 'mes=2026-12');
      expect(primera.status).toBe(200);
      expect(segunda.status).toBe(200);
      expect(segunda.body).toEqual(primera.body);

      for (const coleccion of [
        e.tarjetas,
        e.cargos,
        e.compras,
        e.transacciones,
        e.categorias,
      ]) {
        coleccion.fallaEscritura = true;
      }
      const rechazar = async () => {
        throw new Error('Fallo simulado de la base de datos');
      };
      e.claves.create = rechazar as never;
      e.claves.updateOne = rechazar as never;
      e.claves.deleteOne = rechazar as never;

      const conEscriturasFallando = await e.proyeccion(visa, 'mes=2026-12');

      expect(conEscriturasFallando.status).toBe(200);
      expect(conEscriturasFallando.body).toEqual(primera.body);
      cerca(conEscriturasFallando.body.total, 346270.05016469, 6);
    });
  });
});
