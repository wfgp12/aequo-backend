import mongoose from 'mongoose';
import {
  CLAVES_DE_UNA_TARJETA,
  MENSAJES,
  OTRO_USUARIO_ID,
  mensajeDeCampo,
  mensajeMencionaCampo,
  tarjetaEsperada,
  usarEntorno,
} from '../../test/tarjetas/arnes-tarjetas.js';

const idAjeno = () => new mongoose.Types.ObjectId().toString();

describe('GET /tarjetas y GET /tarjetas/:id (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();

  describe('listar', () => {
    it('CA-RF24-31 lista solo las tarjetas del usuario, por nombre sin distinguir mayúsculas', async () => {
      await entorno.sembrarTarjeta({ nombre: 'visa' });
      await entorno.sembrarTarjeta({ nombre: 'Amex' });
      await entorno.sembrarTarjeta({ nombre: 'banco' });
      await entorno.sembrarTarjeta({ nombre: 'Cencosud' }, OTRO_USUARIO_ID);

      const { status, body } = await entorno.listarTarjetas();

      expect(status).toBe(200);
      expect(Object.keys(body)).toEqual(['items']);
      expect(body.items.map((tarjeta: { nombre: string }) => tarjeta.nombre)).toEqual(['Amex', 'banco', 'visa']);
      for (const tarjeta of body.items) {
        expect(tarjeta).toEqual(tarjetaEsperada());
        expect(Object.keys(tarjeta).sort()).toEqual(CLAVES_DE_UNA_TARJETA);
      }
    });

    it('CA-RF24-32 sin tarjetas, la lista es vacía (no 404)', async () => {
      const { status, body } = await entorno.listarTarjetas();

      expect(status).toBe(200);
      expect(body).toEqual({ items: [] });
    });

    it.each(['activo=true', 'pagina=2'])(
      'CA-RF24-33 el parámetro de query desconocido %s responde 400',
      async (consulta) => {
        const { status, body } = await entorno.listarTarjetas(consulta);

        expect(status).toBe(400);
        expect(mensajeMencionaCampo(body, consulta.split('=')[0])).toBe(true);
      },
    );
  });

  describe('consultar una tarjeta', () => {
    it('CA-RF24-34 consultar una tarjeta propia devuelve exactamente la tarjeta del contrato', async () => {
      const id = await entorno.sembrarTarjeta({ nombre: 'Visa', tasaEA: 0.2921 });

      const { status, body } = await entorno.obtenerTarjeta(id);

      expect(status).toBe(200);
      expect(body).toEqual(tarjetaEsperada({ id, nombre: 'Visa', tasaEA: 0.2921, cuotaUnicaSinInteres: false }));
      expect(Object.keys(body).sort()).toEqual(CLAVES_DE_UNA_TARJETA);
    });

    it('CA-RF24-35 una tarjeta inexistente o de otro usuario responde 404 con el mismo mensaje, no 403', async () => {
      const deB = await entorno.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);

      const inexistente = await entorno.obtenerTarjeta(idAjeno());
      const ajena = await entorno.obtenerTarjeta(deB);

      const esperado = { statusCode: 404, message: MENSAJES.tarjetaNoEncontrada, error: 'Not Found' };
      expect(inexistente.status).toBe(404);
      expect(inexistente.body).toEqual(esperado);
      expect(ajena.status).toBe(404);
      expect(ajena.body).toEqual(esperado);
    });

    it('CA-RF24-36 un id mal formado responde 400 en GET, PATCH y DELETE', async () => {
      const respuestas = [
        await entorno.obtenerTarjeta('abc'),
        await entorno.editarTarjeta('abc', { nombre: 'Nueva' }),
        await entorno.eliminarTarjeta('abc'),
      ];

      for (const { status, body } of respuestas) {
        expect(status).toBe(400);
        expect(mensajeDeCampo(body, 'id')).toBe(true);
      }
    });
  });
});
