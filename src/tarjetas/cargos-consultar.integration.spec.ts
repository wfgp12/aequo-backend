import mongoose from 'mongoose';
import {
  CLAVES_DE_UN_CARGO,
  MENSAJES,
  OTRO_USUARIO_ID,
  cargoEsperado,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntorno,
} from '../../test/tarjetas/arnes-tarjetas.js';

const idAjeno = () => new mongoose.Types.ObjectId().toString();
const NO_TARJETA = { statusCode: 404, message: MENSAJES.tarjetaNoEncontrada, error: 'Not Found' };
const NO_CARGO = { statusCode: 404, message: MENSAJES.cargoNoEncontrado, error: 'Not Found' };
const descripciones = (items: Array<{ descripcion: string }>) => items.map((cargo) => cargo.descripcion);

describe('GET y PATCH de cargos fijos: listar, consultar y activar o desactivar (integración)', () => {
  const entorno = usarEntorno();

  describe('listar (GET /tarjetas/:tarjetaId/cargos)', () => {
    it('CA-RF29-30 lista solo los cargos de esa tarjeta, en el orden en que se crearon', async () => {
      const visa = await entorno.sembrarTarjeta({ nombre: 'Visa' });
      const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard' });
      const deB = await entorno.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
      await entorno.sembrarCargo(visa, { descripcion: 'Zeta' });
      await entorno.sembrarCargo(mastercard, { descripcion: 'De Mastercard' });
      await entorno.sembrarCargo(visa, { descripcion: 'Alfa' });
      await entorno.sembrarCargo(deB, { descripcion: 'De B' }, OTRO_USUARIO_ID);
      await entorno.sembrarCargo(visa, { descripcion: 'Media' });

      const { status, body } = await entorno.listarCargos(visa);

      expect(status).toBe(200);
      expect(Object.keys(body)).toEqual(['items']);
      expect(descripciones(body.items)).toEqual(['Zeta', 'Alfa', 'Media']);
      for (const cargo of body.items) {
        expect(cargo).toEqual(cargoEsperado({ tarjetaId: visa }));
        expect(Object.keys(cargo).sort()).toEqual(CLAVES_DE_UN_CARGO);
      }
    });

    it('CA-RF29-31 filtra por activo y rechaza un filtro inválido o un parámetro desconocido', async () => {
      const tarjetaId = await entorno.sembrarTarjeta();
      await entorno.sembrarCargo(tarjetaId, { descripcion: 'Netflix', activo: true });
      await entorno.sembrarCargo(tarjetaId, { descripcion: 'Seguro', activo: false });
      await entorno.sembrarCargo(tarjetaId, { descripcion: 'Spotify', activo: true });

      const activos = await entorno.listarCargos(tarjetaId, 'activo=true');
      const inactivos = await entorno.listarCargos(tarjetaId, 'activo=false');
      const todos = await entorno.listarCargos(tarjetaId);
      const invalido = await entorno.listarCargos(tarjetaId, 'activo=quizás');
      const desconocido = await entorno.listarCargos(tarjetaId, 'valor=1');

      expect(descripciones(activos.body.items)).toEqual(['Netflix', 'Spotify']);
      expect(descripciones(inactivos.body.items)).toEqual(['Seguro']);
      expect(descripciones(todos.body.items)).toEqual(['Netflix', 'Seguro', 'Spotify']);
      expect(invalido.status).toBe(400);
      expect(Array.isArray(invalido.body.message)).toBe(true);
      expect(mensajeDeCampo(invalido.body, 'activo')).toBe(true);
      expect(desconocido.status).toBe(400);
      expect(mensajeMencionaCampo(desconocido.body, 'valor')).toBe(true);
    });

    it('CA-RF29-32 sin cargos la lista es vacía; la tarjeta de otro usuario responde 404', async () => {
      const propia = await entorno.sembrarTarjeta({ nombre: 'Visa' });
      const deB = await entorno.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
      await entorno.sembrarCargo(deB, { descripcion: 'De B' }, OTRO_USUARIO_ID);

      const vacia = await entorno.listarCargos(propia);
      const ajena = await entorno.listarCargos(deB);

      expect(vacia.status).toBe(200);
      expect(vacia.body).toEqual({ items: [] });
      expect(ajena.status).toBe(404);
      expect(ajena.body).toEqual(NO_TARJETA);
    });
  });

  describe('consultar (GET /tarjetas/:tarjetaId/cargos/:id)', () => {
    it('CA-RF29-33 consultar un cargo propio devuelve exactamente el cargo del contrato', async () => {
      const tarjetaId = await entorno.sembrarTarjeta();
      const id = await entorno.sembrarCargo(tarjetaId, { descripcion: 'Netflix', valor: 38900 });

      const { status, body } = await entorno.obtenerCargo(tarjetaId, id);

      expect(status).toBe(200);
      expect(body).toEqual(cargoEsperado({ id, tarjetaId, descripcion: 'Netflix', valor: 38900, activo: true }));
      expect(Object.keys(body).sort()).toEqual(CLAVES_DE_UN_CARGO);
    });

    it('CA-RF29-34 un cargo inexistente, de otro usuario o de otra tarjeta responde 404 con el mismo mensaje', async () => {
      const visa = await entorno.sembrarTarjeta({ nombre: 'Visa' });
      const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard' });
      const deB = await entorno.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
      const cargoDeB = await entorno.sembrarCargo(deB, { descripcion: 'De B' }, OTRO_USUARIO_ID);
      const cargoDeMastercard = await entorno.sembrarCargo(mastercard, { descripcion: 'De Mastercard' });

      const inexistente = await entorno.obtenerCargo(visa, idAjeno());
      const ajeno = await entorno.obtenerCargo(visa, cargoDeB);
      const deOtraTarjeta = await entorno.obtenerCargo(visa, cargoDeMastercard);
      const tarjetaAjena = await entorno.obtenerCargo(deB, cargoDeB);
      const tarjetaInexistente = await entorno.obtenerCargo(idAjeno(), cargoDeMastercard);

      for (const respuesta of [inexistente, ajeno, deOtraTarjeta]) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(NO_CARGO);
      }
      for (const respuesta of [tarjetaAjena, tarjetaInexistente]) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(NO_TARJETA);
      }
    });

    it('CA-RF29-35 un id mal formado, de tarjeta o de cargo, responde 400 en las cinco rutas', async () => {
      const tarjetaId = await entorno.sembrarTarjeta();
      const id = await entorno.sembrarCargo(tarjetaId);

      const conTarjetaMala = [
        await entorno.crearCargo('abc', { descripcion: 'Netflix', valor: 38900 }),
        await entorno.listarCargos('abc'),
        await entorno.obtenerCargo('abc', id),
        await entorno.editarCargo('abc', id, { valor: 45000 }),
        await entorno.eliminarCargo('abc', id),
      ];
      const conIdMalo = [
        await entorno.obtenerCargo(tarjetaId, 'abc'),
        await entorno.editarCargo(tarjetaId, 'abc', { valor: 45000 }),
        await entorno.eliminarCargo(tarjetaId, 'abc'),
      ];

      for (const { status, body } of conTarjetaMala) {
        expect(status).toBe(400);
        expect(mensajeDeCampo(body, 'tarjetaId')).toBe(true);
      }
      for (const { status, body } of conIdMalo) {
        expect(status).toBe(400);
        expect(mensajeDeCampo(body, 'id')).toBe(true);
      }
    });
  });

  describe('activar y desactivar (PATCH de activo)', () => {
    it('CA-RF29-36 desactivar y volver a activar un cargo: se conserva y el resto no cambia', async () => {
      const tarjetaId = await entorno.sembrarTarjeta();
      const id = await entorno.sembrarCargo(tarjetaId, { descripcion: 'Netflix', valor: 38900 });
      const base = { id, tarjetaId, descripcion: 'Netflix', valor: 38900 };

      const desactivado = await entorno.editarCargo(tarjetaId, id, { activo: false });
      const sinFiltro = await entorno.listarCargos(tarjetaId);
      const inactivos = await entorno.listarCargos(tarjetaId, 'activo=false');
      const activado = await entorno.editarCargo(tarjetaId, id, { activo: true });

      expect(desactivado.status).toBe(200);
      expect(desactivado.body).toEqual(cargoEsperado({ ...base, activo: false }));
      expect(sinFiltro.body.items).toHaveLength(1);
      expect(inactivos.body.items).toHaveLength(1);
      expect(activado.status).toBe(200);
      expect(activado.body).toEqual(cargoEsperado({ ...base, activo: true }));
      expect(entorno.cargos.docs).toHaveLength(1);
    });
  });
});
