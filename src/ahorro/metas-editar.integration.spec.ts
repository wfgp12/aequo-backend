import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  MENSAJES,
  OTRO_USUARIO_ID,
  mensajeDeCampo,
  mensajeMencionaCampo,
  metaEsperada,
  usarEntorno,
} from '../../test/ahorro/arnes-metas.js';

const ERROR_404 = { statusCode: 404, message: MENSAJES.noEncontrada, error: 'Not Found' };
const ERROR_409 = { statusCode: 409, message: MENSAJES.duplicada, error: 'Conflict' };
const idInexistente = () => new mongoose.Types.ObjectId().toString();

describe('PATCH /ahorro/metas/:id (integración: guard de sesión real y MongoDB simulado)', () => {
  const entorno = usarEntorno();

  /** Lo guardado de una meta, para comprobar que una edición rechazada no cambió nada. */
  const estado = (id: string) => {
    const { tipoMeta, valorObjetivo, periodo, ahorroReal } = entorno.guardada(id) ?? {};
    return { tipoMeta, valorObjetivo, periodo: (periodo as Date | undefined)?.toISOString(), ahorroReal };
  };

  describe('ajustar valor y tipo', () => {
    it('CA-RF21-49 ajusta el valor de la meta del mes y deja el resto igual, sin duplicarla', async () => {
      const id = await entorno.sembrar({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });
      const antes = { ...entorno.guardada(id) };

      const { status, body } = await entorno.editar(id, { valorObjetivo: 25 });

      expect(status).toBe(200);
      expect(body).toEqual(
        metaEsperada({
          id,
          tipoMeta: 'PORCENTAJE',
          valorObjetivo: 25,
          periodo: '2026-11',
          ahorroReal: 0,
          creadaEn: antes.createdAt.toISOString(),
        }),
      );
      expect(new Date(body.actualizadaEn).getTime()).toBeGreaterThanOrEqual(antes.updatedAt.getTime());
      expect(entorno.metas.docs).toHaveLength(1);
      expect(entorno.guardada(id)?.valorObjetivo).toBe(25);
    });

    it.each([
      ['de porcentaje a monto fijo', 'PORCENTAJE', 20, { tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000 }],
      ['de monto fijo a porcentaje', 'MONTO_FIJO', 300000, { tipoMeta: 'PORCENTAJE', valorObjetivo: 15 }],
    ])('CA-RF21-50 cambia el tipo y el valor a la vez %s', async (_caso, tipoMeta, valorObjetivo, cambio) => {
      const id = await entorno.sembrar({ tipoMeta, valorObjetivo });

      const { status, body } = await entorno.editar(id, cambio);

      expect(status).toBe(200);
      expect(body.tipoMeta).toBe(cambio.tipoMeta);
      expect(body.valorObjetivo).toBe(cambio.valorObjetivo);
      expect(entorno.guardada(id)).toMatchObject(cambio);
    });

    it('CA-RF21-51 enviar solo el valor lo revalida contra el tipo guardado: tope de 100 en porcentaje, sin tope en monto fijo', async () => {
      const porcentaje = await entorno.sembrar({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-10' });
      const monto = await entorno.sembrar({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000, periodo: '2026-11' });

      const rechazada = await entorno.editar(porcentaje, { valorObjetivo: 150 });
      const aceptadaMonto = await entorno.editar(monto, { valorObjetivo: 150 });

      expect(rechazada.status).toBe(400);
      expect(mensajeDeCampo(rechazada.body, 'valorObjetivo')).toBe(true);
      expect(rechazada.body.message.join(' ')).toContain('100');
      expect(entorno.guardada(porcentaje)?.valorObjetivo).toBe(20);
      expect(aceptadaMonto.status).toBe(200);
      expect(aceptadaMonto.body.valorObjetivo).toBe(150);

      const enElTope = await entorno.editar(porcentaje, { valorObjetivo: 100 });
      expect(enElTope.status).toBe(200);
      expect(enElTope.body.valorObjetivo).toBe(100);
    });

    it.each([
      ['de monto fijo a porcentaje', 'MONTO_FIJO', 300000, 'PORCENTAJE'],
      ['de porcentaje a monto fijo', 'PORCENTAJE', 20, 'MONTO_FIJO'],
    ])('CA-RF21-52 cambiar el tipo %s sin enviar el valor responde 400 y no cambia nada', async (_caso, tipoMeta, valorObjetivo, nuevoTipo) => {
      const id = await entorno.sembrar({ tipoMeta, valorObjetivo });
      const antes = estado(id);

      const { status, body } = await entorno.editar(id, { tipoMeta: nuevoTipo });

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'valorObjetivo')).toBe(true);
      expect(body.message.join(' ')).toContain('tipoMeta');
      expect(estado(id)).toEqual(antes);
    });

    it('CA-RF21-65 al cambiar el tipo, el valor enviado se valida contra el tipo nuevo', async () => {
      const monto = await entorno.sembrar({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000, periodo: '2026-10' });
      const porcentaje = await entorno.sembrar({ tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11' });
      const antes = estado(monto);

      const rechazada = await entorno.editar(monto, { tipoMeta: 'PORCENTAJE', valorObjetivo: 300000 });
      const aceptada = await entorno.editar(porcentaje, { tipoMeta: 'MONTO_FIJO', valorObjetivo: 150 });

      expect(rechazada.status).toBe(400);
      expect(mensajeDeCampo(rechazada.body, 'valorObjetivo')).toBe(true);
      expect(rechazada.body.message.join(' ')).toContain('100');
      expect(estado(monto)).toEqual(antes);
      expect(aceptada.status).toBe(200);
      expect(aceptada.body).toMatchObject({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 150 });
    });
  });

  describe('edición inválida: 400 y la meta no cambia', () => {
    it.each([
      ['valorObjetivo en cero', 'valorObjetivo', { valorObjetivo: 0 }],
      ['valorObjetivo negativo', 'valorObjetivo', { valorObjetivo: -3 }],
      ['valorObjetivo como texto', 'valorObjetivo', { valorObjetivo: '20' }],
      ['tipoMeta fuera de la enumeración', 'tipoMeta', { tipoMeta: 'OBJETIVO', valorObjetivo: 20 }],
      ['valorObjetivo null', 'valorObjetivo', { valorObjetivo: null }],
    ])('CA-RF21-53 %s', async (_caso, campo, cuerpo) => {
      const id = await entorno.sembrar();
      const antes = estado(id);

      const { status, body } = await entorno.editar(id, cuerpo);

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, campo)).toBe(true);
      expect(estado(id)).toEqual(antes);
    });

    it('CA-RF21-54 un cuerpo vacío responde 400 y la meta no cambia', async () => {
      const id = await entorno.sembrar();
      const antes = estado(id);

      const { status } = await entorno.editar(id, {});

      expect(status).toBe(400);
      expect(estado(id)).toEqual(antes);
    });

    it.each(['usuarioId', 'id', 'createdAt', 'actualizadaEn'])(
      'CA-RF21-55 rechaza el campo no editable %s, solo o junto a un campo válido, sin cambiar nada',
      async (campo) => {
        const id = await entorno.sembrar({ valorObjetivo: 20 });
        const antes = estado(id);

        const solo = await entorno.editar(id, { [campo]: OTRO_USUARIO_ID });
        const junto = await entorno.editar(id, { valorObjetivo: 25, [campo]: OTRO_USUARIO_ID });

        for (const respuesta of [solo, junto]) {
          expect(respuesta.status).toBe(400);
          expect(mensajeMencionaCampo(respuesta.body, campo)).toBe(true);
        }
        expect(estado(id)).toEqual(antes);
      },
    );

    it('CA-RF21-56 repetir el mismo ajuste es inofensivo: responde 200 con la misma meta', async () => {
      const id = await entorno.sembrar({ valorObjetivo: 20 });

      const primera = await entorno.editar(id, { valorObjetivo: 25 });
      const segunda = await entorno.editar(id, { valorObjetivo: 25 });

      expect(primera.status).toBe(200);
      expect(segunda.status).toBe(200);
      expect({ ...segunda.body, actualizadaEn: undefined }).toEqual({ ...primera.body, actualizadaEn: undefined });
      expect(entorno.metas.docs).toHaveLength(1);
    });

    it('CA-RF21-57 editar la meta de otro usuario o una inexistente responde 404 con el mismo mensaje', async () => {
      const deOtro = await entorno.sembrar({ valorObjetivo: 20, periodo: '2026-11' }, OTRO_USUARIO_ID);
      const antes = estado(deOtro);

      const casos = [
        await entorno.editar(deOtro, { valorObjetivo: 25 }),
        await entorno.editar(deOtro, { periodo: '2027-01' }),
        await entorno.editar(idInexistente(), { valorObjetivo: 25 }),
      ];

      for (const respuesta of casos) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(ERROR_404);
      }
      expect(estado(deOtro)).toEqual(antes);
    });
  });

  describe('ahorroReal', () => {
    it('CA-RF21-68 se puede editar el ahorroReal, positivo, negativo o cero, sin exigir valorObjetivo', async () => {
      const id = await entorno.sembrar({ valorObjetivo: 20, ahorroReal: 0 });

      for (const ahorroReal of [150000, -25000, 0]) {
        const { status, body } = await entorno.editar(id, { ahorroReal });
        expect(status, String(ahorroReal)).toBe(200);
        expect(body).toEqual(metaEsperada({ id, tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2026-11', ahorroReal }));
        expect(entorno.guardada(id)?.ahorroReal).toBe(ahorroReal);
      }
    });

    it.each([
      ['un texto', 'mucho'],
      ['un texto numérico', '150000'],
      ['null', null],
    ])('CA-RF21-69 rechaza un ahorroReal que es %s', async (_caso, ahorroReal) => {
      const id = await entorno.sembrar({ ahorroReal: 1000 });
      const antes = estado(id);

      const { status, body } = await entorno.editar(id, { ahorroReal });

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'ahorroReal')).toBe(true);
      expect(estado(id)).toEqual(antes);
    });
  });

  describe('mover la meta a otro mes', () => {
    it('CA-RF21-70 mueve la meta a un mes libre (YYYY-MM o fecha completa) y libera el mes anterior', async () => {
      const id = await entorno.sembrar({ valorObjetivo: 20, periodo: '2026-11' });
      const otra = await entorno.sembrar({ valorObjetivo: 30, periodo: '2026-12' });

      const aEnero = await entorno.editar(id, { periodo: '2027-01' });
      const aMarzo = await entorno.editar(otra, { periodo: '2027-03-20' });

      expect(aEnero.status).toBe(200);
      expect(aEnero.body).toEqual(metaEsperada({ id, tipoMeta: 'PORCENTAJE', valorObjetivo: 20, periodo: '2027-01', ahorroReal: 0 }));
      expect(aMarzo.status).toBe(200);
      expect(aMarzo.body.periodo).toBe('2027-03');
      expect(entorno.metas.docs).toHaveLength(2);
      expect(entorno.guardada(id)?.periodo.toISOString()).toBe('2027-01-01T00:00:00.000Z');
      expect(entorno.guardada(otra)?.periodo.toISOString()).toBe('2027-03-01T00:00:00.000Z');

      const nueva = await entorno.crear({ tipoMeta: 'PORCENTAJE', valorObjetivo: 10, periodo: '2026-11' });
      expect(nueva.status).toBe(201);
    });

    it.each([
      ['en YYYY-MM', { periodo: '2026-12' }],
      ['como fecha completa', { periodo: '2026-12-15' }],
      ['junto a otro campo válido', { periodo: '2026-12', valorObjetivo: 40 }],
    ])('CA-RF21-71 mover la meta a un mes que ya tiene otra (%s) responde 409 y no cambia ninguna', async (_caso, cuerpo) => {
      const movida = await entorno.sembrar({ valorObjetivo: 20, periodo: '2026-11' });
      const ocupante = await entorno.sembrar({ valorObjetivo: 30, periodo: '2026-12' });
      const antes = [estado(movida), estado(ocupante)];

      const { status, body } = await entorno.editar(movida, cuerpo);

      expect(status).toBe(409);
      expect(body).toEqual(ERROR_409);
      expect([estado(movida), estado(ocupante)]).toEqual(antes);
    });

    it.each(['2026-11', '2026-11-25'])('CA-RF21-72 mover una meta a su propio mes (%s) no es conflicto', async (periodo) => {
      const id = await entorno.sembrar({ valorObjetivo: 20, periodo: '2026-11' });

      const { status, body } = await entorno.editar(id, { periodo });

      expect(status).toBe(200);
      expect(body).toEqual(metaEsperada({ id, valorObjetivo: 20, periodo: '2026-11' }));
      expect(entorno.metas.docs).toHaveLength(1);
    });

    it('CA-RF21-73 un mes ocupado por otro usuario no estorba', async () => {
      const mia = await entorno.sembrar({ periodo: '2026-11' });
      const deOtro = await entorno.sembrar({ periodo: '2027-01' }, OTRO_USUARIO_ID);
      const antesOtro = estado(deOtro);

      const { status, body } = await entorno.editar(mia, { periodo: '2027-01' });

      expect(status).toBe(200);
      expect(body.periodo).toBe('2027-01');
      expect(estado(deOtro)).toEqual(antesOtro);
    });

    it.each(['noviembre', '2026-13', '2026-1', '2027-02-29', '2026-11-15T10:00:00Z', null])(
      'CA-RF21-74 rechaza el periodo inválido %j al editar',
      async (periodo) => {
        const id = await entorno.sembrar({ periodo: '2026-11' });
        const antes = estado(id);

        const { status, body } = await entorno.editar(id, { periodo });

        expect(status).toBe(400);
        expect(mensajeDeCampo(body, 'periodo')).toBe(true);
        expect(estado(id)).toEqual(antes);
      },
    );

    it('CA-RF21-75 dos movimientos simultáneos al mismo mes libre: uno responde 200, el otro 409, nunca 500', async () => {
      const a = await entorno.sembrar({ periodo: '2026-11' });
      const b = await entorno.sembrar({ periodo: '2026-12' });

      const [primera, segunda] = await Promise.all([
        entorno.editar(a, { periodo: '2027-01' }),
        entorno.editar(b, { periodo: '2027-01' }),
      ]);

      expect([primera.status, segunda.status].sort()).toEqual([200, 409]);
      const perdedora = primera.status === 409 ? primera : segunda;
      expect(perdedora.body).toEqual(ERROR_409);
      const enEnero = entorno.metas.docs.filter((doc) => doc.periodo.toISOString() === '2027-01-01T00:00:00.000Z');
      expect(enEnero).toHaveLength(1);
      expect(entorno.metas.docs).toHaveLength(2);
    });

    it('CA-RF21-75 un movimiento y una creación simultáneos para el mismo mes libre: solo uno gana, nunca 500', async () => {
      const id = await entorno.sembrar({ periodo: '2026-11' });

      const [movimiento, creacion] = await Promise.all([
        entorno.editar(id, { periodo: '2027-01' }),
        entorno.crear({ tipoMeta: 'MONTO_FIJO', valorObjetivo: 300000, periodo: '2027-01' }, { clave: randomUUID() }),
      ]);

      expect([movimiento.status, creacion.status]).toSatisfy(
        ([m, c]: number[]) => (m === 200 && c === 409) || (m === 409 && c === 201),
      );
      const enEnero = entorno.metas.docs.filter((doc) => doc.periodo.toISOString() === '2027-01-01T00:00:00.000Z');
      expect(enEnero).toHaveLength(1);
    });
  });
});
