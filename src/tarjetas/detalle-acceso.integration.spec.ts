import {
  MENSAJES,
  OTRO_USUARIO_ID,
  error404,
  mensajeDeCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import { fotografiaTotal } from '../../test/tarjetas/escenario-pagos.js';
import { sembrarEscenarioBase } from '../../test/tarjetas/escenario-proyeccion.js';

// Paquete 5.3.6 (RF-31): el detalle no cambia las reglas de acceso y de error de la ruta ni revela compras ajenas.
describe('GET /tarjetas/:tarjetaId/proyeccion: acceso y errores con el detalle (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF31-43 las reglas de acceso y de error siguen igual y no revelan compras ajenas', async () => {
    const { visa } = await sembrarEscenarioBase(e);
    const { visa: deB, compras: comprasDeB } = await sembrarEscenarioBase(
      e,
      OTRO_USUARIO_ID,
    );
    const inexistente = '665f1c2e9b1d4a0012ab34ee';
    const antes = fotografiaTotal(e);

    const ajena = await e.proyeccion(deB, 'mes=2026-12');
    const noExiste = await e.proyeccion(inexistente, 'mes=2026-12');
    const mesInvalido = await e.proyeccion(visa, 'mes=2026-13');
    const malFormada = await e.proyeccion('no-es-un-id');
    const sinSesion = await e.proyeccion(deB, 'mes=2026-12', { token: null });

    for (const respuesta of [ajena, noExiste]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
    }
    expect(mesInvalido.status).toBe(400);
    expect(mensajeDeCampo(mesInvalido.body, 'mes')).toBe(true);
    expect(malFormada.status).toBe(400);
    expect(mensajeDeCampo(malFormada.body, 'tarjetaId')).toBe(true);
    expect(sinSesion.status).toBe(401);
    for (const respuesta of [ajena, noExiste, mesInvalido, malFormada, sinSesion]) {
      expect(respuesta.body).not.toHaveProperty('detalle');
      const texto = JSON.stringify(respuesta.body);
      for (const id of Object.values(comprasDeB)) expect(texto).not.toContain(id);
    }
    // La consulta sigue sin guardar nada (CA-RF30-29).
    expect(fotografiaTotal(e)).toBe(antes);
  });
});
