import { JwtService } from '@nestjs/jwt';
import { SECRETO_JWT, USUARIO_ID, usarEntorno } from '../../test/tarjetas/arnes-tarjetas.js';

const ERROR_401 = { statusCode: 401, message: 'Sesión inválida o vencida', error: 'Unauthorized' };

const sesiones: Array<[string, () => string | null]> = [
  ['sin el header Authorization', () => null],
  ['con un token que no emitió este backend', () => 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma-falsa'],
  [
    'con un token vencido',
    () =>
      new JwtService({ secret: SECRETO_JWT, signOptions: { algorithm: 'HS256' } }).sign(
        { sub: USUARIO_ID },
        { expiresIn: -10 },
      ),
  ],
];

describe('Tarjetas y cargos fijos: sin sesión válida (integración)', () => {
  const entorno = usarEntorno();

  it.each(sesiones)(
    'CA-RF24-37 las cinco rutas de /tarjetas responden 401 %s y no cambian nada',
    async (_caso, obtenerToken) => {
      const id = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });
      const token = obtenerToken();

      // En serie: la prueba verifica una ruta tras otra, no la concurrencia.
      const rutas = [
        () => entorno.crearTarjeta({ nombre: 'Mastercard', tasaEA: 0.3 }, { token }),
        () => entorno.listarTarjetas('', token),
        () => entorno.obtenerTarjeta(id, token),
        () => entorno.editarTarjeta(id, { tasaEA: 0.5 }, token),
        () => entorno.eliminarTarjeta(id, token),
      ];
      for (const enviar of rutas) {
        const respuesta = await enviar();
        expect(respuesta.status).toBe(401);
        expect(respuesta.body).toEqual(ERROR_401);
      }
      expect(entorno.tarjetas.docs).toHaveLength(1);
      expect(entorno.tarjetaGuardada(id)).toMatchObject({ nombre: 'Visa', tasaEA: 0.2921 });
    },
  );

  it.each(sesiones)(
    'CA-RF29-37 las cinco rutas de cargos responden 401 %s y no cambian nada',
    async (_caso, obtenerToken) => {
      const tarjetaId = await entorno.sembrarTarjeta();
      const id = await entorno.sembrarCargo(tarjetaId, { descripcion: 'Netflix', valor: 38900 });
      const token = obtenerToken();

      const rutas = [
        () => entorno.crearCargo(tarjetaId, { descripcion: 'Spotify', valor: 19900 }, { token }),
        () => entorno.listarCargos(tarjetaId, '', token),
        () => entorno.obtenerCargo(tarjetaId, id, token),
        () => entorno.editarCargo(tarjetaId, id, { valor: 45000 }, token),
        () => entorno.eliminarCargo(tarjetaId, id, token),
      ];
      for (const enviar of rutas) {
        const respuesta = await enviar();
        expect(respuesta.status).toBe(401);
        expect(respuesta.body).toEqual(ERROR_401);
      }
      expect(entorno.cargos.docs).toHaveLength(1);
      expect(entorno.cargoGuardado(id)).toMatchObject({ descripcion: 'Netflix', valor: 38900 });
    },
  );
});
