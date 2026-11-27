import { once } from 'node:events';
import type request from 'supertest';
import type { ColeccionEnMemoria, Operacion } from '../comun/coleccion-memoria.js';
import type { EntornoDeudas } from './arnes-deudas.js';

/** Vueltas del bucle de eventos sin ninguna operación en la base para dar a una petición por detenida (esperando). */
const VUELTAS_QUIETAS = 100;
const VUELTAS_MAXIMAS = 5000;

const vuelta = () => new Promise<void>((resolver) => setImmediate(resolver));

/**
 * Cruza dos peticiones de forma determinista y sin esperas por tiempo: detiene `primera` justo antes de su primera
 * `operacion` sobre `coleccion`, lanza `segunda` y suelta `primera` cuando `segunda` ya respondió o ya no avanza en la
 * base (está esperando a la primera). Así sirve tanto si se atienden entrelazadas como si se atienden en fila.
 */
export async function cruzar(
  e: EntornoDeudas,
  punto: { coleccion: ColeccionEnMemoria; operacion: Operacion },
  primera: () => request.Test,
  segunda: () => request.Test,
) {
  let operaciones = 0;
  let detenida = false;
  let soltar!: () => void;
  let avisar!: () => void;
  const compuerta = new Promise<void>((resolver) => (soltar = resolver));
  const enElPunto = new Promise<void>((resolver) => (avisar = resolver));
  for (const coleccion of [e.deudas, e.transacciones]) {
    coleccion.alOperar = async (operacion) => {
      operaciones++;
      if (detenida || coleccion !== punto.coleccion || operacion !== punto.operacion) return;
      detenida = true;
      avisar();
      await compuerta;
    };
  }

  // `then` es lo que envía una petición de supertest.
  const respuestaPrimera = primera().then((r) => r);
  await Promise.race([enElPunto, respuestaPrimera]);

  const llegada = once(e.app.getHttpServer(), 'request');
  let segundaRespondio = false;
  const respuestaSegunda = segunda().then((r) => {
    segundaRespondio = true;
    return r;
  });
  await llegada;
  for (let total = 0, quietas = 0; !segundaRespondio && quietas < VUELTAS_QUIETAS && total < VUELTAS_MAXIMAS; total++) {
    const antes = operaciones;
    await vuelta();
    quietas = operaciones === antes ? quietas + 1 : 0;
  }
  soltar();

  const respuestas = await Promise.all([respuestaPrimera, respuestaSegunda]);
  // Si la primera nunca pasa por ese punto, la prueba no estaría cruzando nada: que se note.
  expect(detenida, 'la primera petición no pasó por el punto de cruce').toBe(true);
  return respuestas;
}
