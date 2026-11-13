import {
  MENSAJES,
  OTRO_USUARIO_ID,
  cargoEsperado,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntorno,
} from '../../test/tarjetas/arnes-tarjetas.js';

const NO_CARGO = { statusCode: 404, message: MENSAJES.cargoNoEncontrado, error: 'Not Found' };

describe('PATCH y DELETE /tarjetas/:tarjetaId/cargos/:id: editar y eliminar cargos fijos (integración)', () => {
  const entorno = usarEntorno();
  let tarjetaId: string;
  let id: string;

  beforeEach(async () => {
    tarjetaId = await entorno.sembrarTarjeta({ nombre: 'Visa' });
    id = await entorno.sembrarCargo(tarjetaId, { descripcion: 'Netflix', valor: 38900 });
  });

  describe('editar', () => {
    it('CA-RF33-12 editar la descripción, el valor o ambos devuelve el cargo completo, sin redondear', async () => {
      const base = { id, tarjetaId, activo: true };

      const descripcion = await entorno.editarCargo(tarjetaId, id, { descripcion: '  Netflix Premium  ' });
      const valor = await entorno.editarCargo(tarjetaId, id, { valor: 45900.5 });
      const ambos = await entorno.editarCargo(tarjetaId, id, { descripcion: 'Netflix 4K', valor: 52900 });

      expect(descripcion.status).toBe(200);
      expect(descripcion.body).toEqual(cargoEsperado({ ...base, descripcion: 'Netflix Premium', valor: 38900 }));
      expect(valor.status).toBe(200);
      expect(valor.body).toEqual(cargoEsperado({ ...base, descripcion: 'Netflix Premium', valor: 45900.5 }));
      expect(ambos.status).toBe(200);
      expect(ambos.body).toEqual(cargoEsperado({ ...base, descripcion: 'Netflix 4K', valor: 52900 }));
      expect(entorno.cargos.docs).toHaveLength(1);
    });

    it.each([
      ['un cuerpo vacío', {}, null],
      ['descripción vacía', { descripcion: '' }, 'descripcion'],
      ['descripción de 101 caracteres', { descripcion: 'x'.repeat(101) }, 'descripcion'],
      ['valor 0', { valor: 0 }, 'valor'],
      ['valor negativo', { valor: -5 }, 'valor'],
      ['valor como texto numérico', { valor: '38900' }, 'valor'],
      ['valor null', { valor: null }, 'valor'],
      ['activo con un texto', { activo: 'quizás' }, 'activo'],
    ])('CA-RF33-13 %s responde 400 y el cargo no cambia', async (_caso, cuerpo, campo) => {
      const { status, body } = await entorno.editarCargo(tarjetaId, id, cuerpo);

      expect(status).toBe(400);
      if (campo) expect(mensajeDeCampo(body, campo)).toBe(true);
      expect(entorno.cargoGuardado(id)).toMatchObject({ descripcion: 'Netflix', valor: 38900, activo: true });
    });

    it.each(['tarjetaId', 'usuarioId', 'id', 'createdAt', 'creadaEn'])(
      'CA-RF33-14 el campo %s no se puede cambiar: 400, solo o junto a un campo válido, y el cargo no cambia',
      async (campo) => {
        const otraTarjeta = await entorno.sembrarTarjeta({ nombre: 'Mastercard' });
        const valor = { tarjetaId: otraTarjeta, usuarioId: OTRO_USUARIO_ID }[campo] ?? '2026-11-01T00:00:00.000Z';

        const solo = await entorno.editarCargo(tarjetaId, id, { [campo]: valor });
        const junto = await entorno.editarCargo(tarjetaId, id, { [campo]: valor, valor: 50000 });

        for (const { status, body } of [solo, junto]) {
          expect(status).toBe(400);
          expect(mensajeMencionaCampo(body, campo)).toBe(true);
        }
        expect(entorno.cargoGuardado(id)).toMatchObject({ valor: 38900 });
        expect(String(entorno.cargoGuardado(id)?.tarjetaId)).toBe(tarjetaId);
      },
    );

    it('CA-RF33-15 repetir la misma edición de un cargo es inofensivo', async () => {
      const primera = await entorno.editarCargo(tarjetaId, id, { valor: 45900 });
      const segunda = await entorno.editarCargo(tarjetaId, id, { valor: 45900 });

      expect(primera.status).toBe(200);
      expect(segunda.status).toBe(200);
      expect(segunda.body).toEqual({ ...primera.body, actualizadaEn: expect.any(String) });
      expect(entorno.cargos.docs).toHaveLength(1);
    });
  });

  describe('eliminar', () => {
    it('CA-RF33-24 eliminar un cargo responde 204 y deja intactos la tarjeta y los otros cargos', async () => {
      const inactivo = await entorno.sembrarCargo(tarjetaId, { descripcion: 'Seguro', activo: false });

      const respuesta = await entorno.eliminarCargo(tarjetaId, id);
      const otro = await entorno.eliminarCargo(tarjetaId, inactivo);

      expect(respuesta.status).toBe(204);
      expect(respuesta.text).toBe('');
      expect(otro.status).toBe(204);
      expect(entorno.cargos.docs).toHaveLength(0);
      expect((await entorno.obtenerCargo(tarjetaId, id)).status).toBe(404);
      expect((await entorno.listarCargos(tarjetaId)).body).toEqual({ items: [] });
      expect(entorno.tarjetaGuardada(tarjetaId)).toBeDefined();
    });

    it('CA-RF33-24 eliminar un cargo no toca el otro cargo de la tarjeta', async () => {
      const otro = await entorno.sembrarCargo(tarjetaId, { descripcion: 'Spotify', valor: 19900 });

      const { status } = await entorno.eliminarCargo(tarjetaId, id);

      expect(status).toBe(204);
      expect(entorno.cargos.docs.map((cargo) => String(cargo._id))).toEqual([otro]);
    });

    it('CA-RF33-25 eliminar un cargo de nuevo responde 404', async () => {
      await entorno.eliminarCargo(tarjetaId, id);

      const { status, body } = await entorno.eliminarCargo(tarjetaId, id);

      expect(status).toBe(404);
      expect(body).toEqual(NO_CARGO);
    });
  });

  it('CA-RF33-26 editar o eliminar el cargo de otro usuario o de otra tarjeta responde 404 y no cambia nada', async () => {
    const mastercard = await entorno.sembrarTarjeta({ nombre: 'Mastercard' });
    const deB = await entorno.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    const cargoDeMastercard = await entorno.sembrarCargo(mastercard, { descripcion: 'Gimnasio', valor: 80000 });
    const cargoDeB = await entorno.sembrarCargo(deB, { descripcion: 'Netflix', valor: 38900 }, OTRO_USUARIO_ID);

    for (const ajeno of [cargoDeB, cargoDeMastercard]) {
      const editado = await entorno.editarCargo(tarjetaId, ajeno, { valor: 50000 });
      const eliminado = await entorno.eliminarCargo(tarjetaId, ajeno);

      expect(editado.status).toBe(404);
      expect(editado.body).toEqual(NO_CARGO);
      expect(eliminado.status).toBe(404);
      expect(eliminado.body).toEqual(NO_CARGO);
    }
    expect(entorno.cargoGuardado(cargoDeB)).toMatchObject({ descripcion: 'Netflix', valor: 38900 });
    expect(entorno.cargoGuardado(cargoDeMastercard)).toMatchObject({ descripcion: 'Gimnasio', valor: 80000 });
  });
});
