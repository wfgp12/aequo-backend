import mongoose from 'mongoose';
import { UsuarioSchema } from './usuario.schema.js';

// Criterio del 1.3.1: el esquema almacena el UID de Firebase, el nombre y el correo, y el UID es único.
describe('Esquema de Usuario', () => {
  const UsuarioModelo = mongoose.model('UsuarioSoloParaPruebas', UsuarioSchema);

  it('guarda el UID de Firebase, el nombre, el correo y la foto, y nada más (ni contraseñas)', () => {
    const campos = Object.keys(UsuarioSchema.paths).filter(
      (campo) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(campo),
    );

    expect(campos.sort()).toEqual(['email', 'firebaseUid', 'fotoUrl', 'nombre']);
  });

  it('el UID de Firebase es único gracias a un índice único', () => {
    expect(UsuarioSchema.indexes()).toContainEqual([
      { firebaseUid: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it.each(['firebaseUid', 'nombre', 'email'])('%s es obligatorio', (campo) => {
    const errores = new UsuarioModelo({}).validateSync()?.errors ?? {};

    expect(Object.keys(errores)).toContain(campo);
  });

  it('con UID, nombre y correo el usuario es válido y la foto vale null por defecto', () => {
    const usuario = new UsuarioModelo({ firebaseUid: 'uid-1', nombre: 'Wilhen', email: 'w@gmail.com' });

    expect(usuario.validateSync()).toBeUndefined();
    expect(usuario.fotoUrl).toBeNull();
  });

  it('usa la colección usuarios y registra las fechas de creación y modificación', () => {
    expect(UsuarioSchema.get('collection')).toBe('usuarios');
    expect(UsuarioSchema.get('timestamps')).toBe(true);
  });
});
