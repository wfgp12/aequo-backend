import { JwtService } from '@nestjs/jwt';
import {
  SECRETO_JWT,
  USUARIO_ID,
  instantanea,
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

describe('Compras y avances con tarjeta: sin sesión válida (integración)', () => {
  const e = usarEntornoCompras();

  it.each(sesiones)(
    'CA-RF26-57 las seis rutas nuevas responden 401 %s y no cambian nada',
    async (_caso, obtenerToken) => {
      const tarjetaId = await e.sembrarTarjeta();
      const compraId = await e.sembrarCompra(tarjetaId);
      const antes = instantanea(e.compras);
      const token = obtenerToken();

      // En serie: la prueba verifica una ruta tras otra, no la concurrencia.
      const rutas = [
        () => e.crearCompra(tarjetaId, e.compraBase(), { token }),
        () => e.crearAvance(tarjetaId, e.avanceBase(), { token }),
        () => e.listarCompras(tarjetaId, '', { token }),
        () => e.obtenerCompra(tarjetaId, compraId, { token }),
        () => e.editarCompra(tarjetaId, compraId, { valor: 1 }, { token }),
        () => e.eliminarCompra(tarjetaId, compraId, { token }),
      ];
      for (const enviar of rutas) {
        const respuesta = await enviar();
        expect(respuesta.status).toBe(401);
        expect(respuesta.body).toEqual(ERROR_401);
      }
      expect(instantanea(e.compras)).toEqual(antes);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );
});
