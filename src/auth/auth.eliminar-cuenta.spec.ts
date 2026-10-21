import mongoose from 'mongoose';
import { AuthService } from './auth.service.js';

const { ObjectId } = mongoose.Schema.Types;
const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';

// Esquemas reales de Mongoose: lo que importa es si declaran el campo `usuarioId`.
const conUsuario = () => new mongoose.Schema({ usuarioId: ObjectId, valor: Number });
const sinUsuario = () => new mongoose.Schema({ nombre: String });

function crearEscenario(colecciones: Record<string, mongoose.Schema>, fallaEn?: string) {
  const llamadas: string[] = [];
  const modelos: Record<string, unknown> = {};
  for (const [nombre, schema] of Object.entries(colecciones)) {
    modelos[nombre] = {
      schema,
      deleteMany: vi.fn(async () => {
        llamadas.push(`deleteMany:${nombre}`);
        if (nombre === fallaEn) {
          throw new Error('MongoDB no disponible');
        }
      }),
    };
  }
  const usuarios = {
    schema: new mongoose.Schema({ firebaseUid: String }),
    deleteOne: vi.fn(async () => {
      llamadas.push('deleteOne:Usuario');
      return { deletedCount: 1 };
    }),
    db: {
      modelNames: () => ['Usuario', ...Object.keys(modelos)],
      model: (nombre: string) => (nombre === 'Usuario' ? usuarios : modelos[nombre]),
    },
  };
  const servicio = new AuthService(usuarios as never, {} as never, {} as never);
  return { servicio, usuarios, modelos, llamadas };
}

describe('AuthService.eliminarCuenta', () => {
  it('borra los datos del usuario en toda colección que declare usuarioId y, al final, al propio usuario', async () => {
    const { servicio, usuarios, modelos, llamadas } = crearEscenario({
      Transaccion: conUsuario(),
      Categoria: conUsuario(),
      Tarjeta: conUsuario(),
      Parametro: sinUsuario(),
    });

    await servicio.eliminarCuenta(USUARIO_ID);

    for (const nombre of ['Transaccion', 'Categoria', 'Tarjeta']) {
      expect((modelos[nombre] as { deleteMany: unknown }).deleteMany).toHaveBeenCalledWith({
        usuarioId: USUARIO_ID,
      });
    }
    expect((modelos.Parametro as { deleteMany: unknown }).deleteMany).not.toHaveBeenCalled();
    expect(usuarios.deleteOne).toHaveBeenCalledWith({ _id: USUARIO_ID });
    expect(llamadas.at(-1)).toBe('deleteOne:Usuario');
    expect(llamadas).toHaveLength(4);
  });

  it('cubre sola las colecciones futuras: cualquier esquema nuevo con usuarioId entra en el borrado', async () => {
    const { servicio, modelos } = crearEscenario({ ComprasCredito: conUsuario(), Presupuesto: conUsuario() });

    await servicio.eliminarCuenta(USUARIO_ID);

    expect((modelos.ComprasCredito as { deleteMany: unknown }).deleteMany).toHaveBeenCalledTimes(1);
    expect((modelos.Presupuesto as { deleteMany: unknown }).deleteMany).toHaveBeenCalledTimes(1);
  });

  it('si falla el borrado de una colección no elimina al usuario y el error se propaga, para poder reintentar', async () => {
    const { servicio, usuarios, llamadas } = crearEscenario(
      { Transaccion: conUsuario(), Categoria: conUsuario() },
      'Transaccion',
    );

    await expect(servicio.eliminarCuenta(USUARIO_ID)).rejects.toThrow('MongoDB no disponible');

    expect(usuarios.deleteOne).not.toHaveBeenCalled();
    expect(llamadas).toEqual(['deleteMany:Transaccion']);
  });

  it('sin colecciones de datos solo elimina al usuario', async () => {
    const { servicio, usuarios } = crearEscenario({});

    await servicio.eliminarCuenta(USUARIO_ID);

    expect(usuarios.deleteOne).toHaveBeenCalledTimes(1);
  });

  it('es idempotente: eliminar una cuenta que ya no existe no es un error', async () => {
    const { servicio, usuarios } = crearEscenario({ Transaccion: conUsuario() });
    usuarios.deleteOne.mockResolvedValue({ deletedCount: 0 });

    await expect(servicio.eliminarCuenta(USUARIO_ID)).resolves.toBeUndefined();
  });
});
