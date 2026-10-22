/// <reference types="vite/client" />
import mongoose from 'mongoose';

// Convención del CLAUDE.md §5: toda colección con datos de un usuario lo referencia con `usuarioId`.
// AuthService.eliminarCuenta() solo borra las colecciones que declaran ese campo, así que esta prueba
// descubre TODOS los esquemas del proyecto y falla si alguno nuevo no lo declara (se quedaría sin borrar).
const modulos = import.meta.glob('../**/*.schema.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;
const esquemas = Object.values(modulos)
  .flatMap((exportado) => Object.entries(exportado))
  .filter((entrada): entrada is [string, mongoose.Schema] => entrada[1] instanceof mongoose.Schema)
  .map(([nombre, schema]) => ({ nombre, schema }));

// El usuario es el dueño de los datos: no se referencia a sí mismo.
const conDatosDeUsuario = esquemas.filter(({ nombre }) => nombre !== 'UsuarioSchema');

describe('Convención usuarioId (eliminación de cuenta)', () => {
  it('descubre los esquemas del proyecto, incluido el de Usuario', () => {
    expect(esquemas.map((e) => e.nombre)).toContain('UsuarioSchema');
    expect(conDatosDeUsuario.length).toBeGreaterThan(0);
  });

  it.each(conDatosDeUsuario.map((e) => [e.nombre, e.schema] as const))(
    '%s declara el campo usuarioId como ObjectId',
    (_nombre, schema) => {
      const campo = schema.path('usuarioId');

      expect(campo, 'falta el campo usuarioId: eliminarCuenta no borraría esta colección').toBeDefined();
      expect(campo.instance).toBe('ObjectId');
    },
  );
});
