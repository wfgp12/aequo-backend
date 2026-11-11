import mongoose from 'mongoose';
import { MENSAJES, OTRO_USUARIO_ID, usarEntorno } from '../../test/ahorro/arnes-metas.js';

const ERROR_404 = { statusCode: 404, message: MENSAJES.noEncontrada, error: 'Not Found' };
const ERROR_409 = { statusCode: 409, message: MENSAJES.conAhorro, error: 'Conflict' };
const idInexistente = () => new mongoose.Types.ObjectId().toString();

describe('DELETE /ahorro/metas/:id (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();

  it('CA-RF21-58 elimina una meta propia sin ahorro registrado: 204 sin cuerpo, y deja de existir y de listarse', async () => {
    const id = await entorno.sembrar({ ahorroReal: 0 });

    const { status, text } = await entorno.eliminar(id);

    expect(status).toBe(204);
    expect(text).toBe('');
    expect(entorno.guardada(id)).toBeUndefined();
    expect((await entorno.listar()).body).toEqual({ items: [] });
    const consulta = await entorno.obtener(id);
    expect(consulta.status).toBe(404);
  });

  it('CA-RF21-59 eliminar de nuevo una meta ya eliminada responde 404', async () => {
    const id = await entorno.sembrar();
    await entorno.eliminar(id).expect(204);

    const { status, body } = await entorno.eliminar(id);

    expect(status).toBe(404);
    expect(body).toEqual(ERROR_404);
  });

  it('CA-RF21-60 tras eliminar, el usuario puede volver a definir la meta de ese mes', async () => {
    const id = await entorno.sembrar({ periodo: '2026-11' });
    await entorno.eliminar(id).expect(204);

    const { status, body } = await entorno.crear({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000, periodo: '2026-11' });

    expect(status).toBe(201);
    expect(body.periodo).toBe('2026-11');
  });

  it('CA-RF21-61 eliminar la meta de otro usuario (incluso con ahorro) o una inexistente responde 404, nunca 409, y la meta ajena sigue existiendo', async () => {
    const deOtro = await entorno.sembrar({ periodo: '2026-11', ahorroReal: 150000 }, OTRO_USUARIO_ID);

    const ajena = await entorno.eliminar(deOtro);
    const inexistente = await entorno.eliminar(idInexistente());

    expect(ajena.status).toBe(404);
    expect(ajena.body).toEqual(ERROR_404);
    expect(inexistente.status).toBe(404);
    expect(inexistente.body).toEqual(ERROR_404);
    expect(entorno.guardada(deOtro)).toBeDefined();
  });

  it('CA-RF21-62 las metas de meses pasados se pueden editar y eliminar', async () => {
    const id = await entorno.sembrar({ periodo: '2026-01', ahorroReal: 0 });

    const edicion = await entorno.editar(id, { valorObjetivo: 30 });
    const eliminacion = await entorno.eliminar(id);

    expect(edicion.status).toBe(200);
    expect(edicion.body.valorObjetivo).toBe(30);
    expect(eliminacion.status).toBe(204);
    expect(entorno.guardada(id)).toBeUndefined();
  });

  it('CA-RF21-76 no se elimina una meta con ahorro registrado (positivo o negativo): 409, sigue intacta, y con ahorroReal en 0 ya se puede', async () => {
    const conGanancia = await entorno.sembrar({ periodo: '2026-10', ahorroReal: 150000 });
    const conPerdida = await entorno.sembrar({ periodo: '2026-11', ahorroReal: -25000 });

    for (const id of [conGanancia, conPerdida]) {
      const { status, body } = await entorno.eliminar(id);
      expect(status).toBe(409);
      expect(body).toEqual(ERROR_409);
      expect(entorno.guardada(id)).toBeDefined();
      expect((await entorno.obtener(id)).status).toBe(200);
    }
    expect(entorno.guardada(conGanancia)?.ahorroReal).toBe(150000);
    expect(entorno.guardada(conPerdida)?.ahorroReal).toBe(-25000);

    await entorno.editar(conGanancia, { ahorroReal: 0 }).expect(200);
    const despues = await entorno.eliminar(conGanancia);

    expect(despues.status).toBe(204);
    expect(entorno.guardada(conGanancia)).toBeUndefined();
  });
});
