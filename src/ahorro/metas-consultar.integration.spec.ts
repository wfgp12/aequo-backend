import mongoose from 'mongoose';
import { CLAVES_DE_UNA_META, MENSAJES, OTRO_USUARIO_ID, mensajeDeCampo, metaEsperada, usarEntorno } from '../../test/ahorro/arnes-metas.js';

const ERROR_404 = { statusCode: 404, message: MENSAJES.noEncontrada, error: 'Not Found' };
const idInexistente = () => new mongoose.Types.ObjectId().toString();

describe('GET /ahorro/metas y GET /ahorro/metas/:id (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();

  describe('listar', () => {
    it('CA-RF21-42 lista solo las metas del usuario, de la más reciente a la más antigua', async () => {
      await entorno.sembrar({ periodo: '2026-09' });
      await entorno.sembrar({ periodo: '2026-11' });
      await entorno.sembrar({ periodo: '2026-10' });
      const ajena = await entorno.sembrar({ periodo: '2026-11' }, OTRO_USUARIO_ID);

      const { status, body } = await entorno.listar();

      expect(status).toBe(200);
      expect(Object.keys(body)).toEqual(['items']);
      expect(body.items).toHaveLength(3);
      expect(body.items.map((meta: { periodo: string }) => meta.periodo)).toEqual(['2026-11', '2026-10', '2026-09']);
      for (const meta of body.items) {
        expect(meta).toEqual(metaEsperada());
        expect(Object.keys(meta).sort()).toEqual(CLAVES_DE_UNA_META);
        expect(meta.id).not.toBe(ajena);
      }
    });

    it('CA-RF21-43 sin metas la lista es vacía, no 404', async () => {
      const { status, body } = await entorno.listar();

      expect(status).toBe(200);
      expect(body).toEqual({ items: [] });
    });

    it.each([
      ['desde=2026-09&hasta=2026-11', ['2026-11', '2026-10', '2026-09']],
      ['desde=2026-11', ['2026-12', '2026-11']],
      ['hasta=2026-09', ['2026-09', '2026-08']],
    ])('CA-RF21-44 el filtro %s incluye los extremos', async (consulta, esperados) => {
      for (const periodo of ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']) {
        await entorno.sembrar({ periodo });
      }

      const { status, body } = await entorno.listar(consulta);

      expect(status).toBe(200);
      expect(body.items.map((meta: { periodo: string }) => meta.periodo)).toEqual(esperados);
    });

    it.each([
      'desde=2026-13',
      'hasta=noviembre',
      'desde=2026-11-01',
      'desde=2026-12&hasta=2026-11',
      'tipo=PORCENTAJE',
    ])('CA-RF21-45 rechaza la consulta inválida %s con 400', async (consulta) => {
      const { status, body } = await entorno.listar(consulta);

      expect(status).toBe(400);
      expect(Array.isArray(body.message)).toBe(true);
      expect(body.message.length).toBeGreaterThan(0);
    });
  });

  describe('consultar una meta', () => {
    it('CA-RF21-46 devuelve exactamente la meta propia con la forma del contrato', async () => {
      const id = await entorno.sembrar({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000, periodo: '2026-11', ahorroReal: 150000 });

      const { status, body } = await entorno.obtener(id);

      expect(status).toBe(200);
      expect(body).toEqual(
        metaEsperada({ id, tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000, periodo: '2026-11', ahorroReal: 150000 }),
      );
      expect(Object.keys(body).sort()).toEqual(CLAVES_DE_UNA_META);
    });

    it('CA-RF21-47 una meta inexistente y una de otro usuario responden 404 con el mismo mensaje, no 403', async () => {
      const deOtro = await entorno.sembrar({ periodo: '2026-11' }, OTRO_USUARIO_ID);

      const inexistente = await entorno.obtener(idInexistente());
      const ajena = await entorno.obtener(deOtro);

      expect(inexistente.status).toBe(404);
      expect(inexistente.body).toEqual(ERROR_404);
      expect(ajena.status).toBe(404);
      expect(ajena.body).toEqual(ERROR_404);
    });

    it.each([
      ['GET', (id: string) => entorno.obtener(id)],
      ['PATCH', (id: string) => entorno.editar(id, { valorObjetivo: 25 })],
      ['DELETE', (id: string) => entorno.eliminar(id)],
    ])('CA-RF21-48 %s con un id mal formado responde 400 con un texto que empieza por id', async (_metodo, peticion) => {
      const { status, body } = await peticion('abc');

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'id')).toBe(true);
    });
  });
});
