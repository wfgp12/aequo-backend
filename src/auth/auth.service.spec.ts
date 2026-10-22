import { UnauthorizedException } from '@nestjs/common';
import { AuthService, SESION_SEGUNDOS } from './auth.service.js';

const MIEMBRO_DESDE = '2026-10-17T18:08:00.000Z';

// Lo que devuelve la API.
const usuarioGuardado = {
  id: '665f1c2e9b1d4a0012ab34cd',
  nombre: 'Wilhen',
  email: 'wilhen@gmail.com',
  fotoUrl: 'https://foto/1.png',
  miembroDesde: MIEMBRO_DESDE,
};

// Lo que devuelve MongoDB: la fecha de creación es un Date en `createdAt`.
const { miembroDesde: _omitido, ...camposDelDocumento } = usuarioGuardado;
const documentoGuardado = { ...camposDelDocumento, createdAt: new Date(MIEMBRO_DESDE) };

function crearServicio() {
  const verifyIdToken = vi.fn();
  const orFail = vi.fn().mockResolvedValue(documentoGuardado);
  const findOneAndUpdate = vi.fn().mockReturnValue({ orFail });
  const findById = vi.fn();
  const generar = vi.fn().mockReturnValue('jwt-propio');
  const servicio = new AuthService(
    { findOneAndUpdate, findById } as never,
    { generar } as never,
    { verifyIdToken } as never,
  );
  return { servicio, verifyIdToken, findOneAndUpdate, findById, generar };
}

describe('AuthService', () => {
  describe('login', () => {
    it('crea o recupera al usuario por UID y devuelve un JWT propio de 24 h', async () => {
      const { servicio, verifyIdToken, findOneAndUpdate, generar } = crearServicio();
      verifyIdToken.mockResolvedValue({
        uid: 'uid-1',
        email: 'wilhen@gmail.com',
        name: 'Wilhen',
        picture: 'https://foto/1.png',
      });

      const respuesta = await servicio.login('id-token');

      expect(verifyIdToken).toHaveBeenCalledWith('id-token', true);
      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { firebaseUid: 'uid-1' },
        {
          $setOnInsert: {
            nombre: 'Wilhen',
            email: 'wilhen@gmail.com',
            fotoUrl: 'https://foto/1.png',
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      expect(generar).toHaveBeenCalledWith(usuarioGuardado.id);
      expect(respuesta).toEqual({
        accessToken: 'jwt-propio',
        expiresIn: SESION_SEGUNDOS,
        usuario: usuarioGuardado,
      });
      expect(SESION_SEGUNDOS).toBe(86400);
    });

    it('usa la parte local del correo como nombre si Google no trae displayName', async () => {
      const { servicio, verifyIdToken, findOneAndUpdate } = crearServicio();
      verifyIdToken.mockResolvedValue({ uid: 'uid-2', email: 'ana.perez@gmail.com' });

      await servicio.login('id-token');

      expect(findOneAndUpdate.mock.calls[0][1]).toEqual({
        $setOnInsert: { nombre: 'ana.perez', email: 'ana.perez@gmail.com', fotoUrl: null },
      });
    });
  });

  describe('obtenerPerfil', () => {
    it('devuelve solo los datos públicos del usuario de la sesión, sin el UID de Firebase', async () => {
      const { servicio, findById } = crearServicio();
      findById.mockResolvedValue({ ...documentoGuardado, firebaseUid: 'uid-secreto', _id: 'interno' });

      const perfil = await servicio.obtenerPerfil(usuarioGuardado.id);

      expect(findById).toHaveBeenCalledWith(usuarioGuardado.id);
      expect(perfil).toEqual(usuarioGuardado);
      expect(JSON.stringify(perfil)).not.toContain('uid-secreto');
    });

    it('responde 401 con el mensaje de sesión inválida si el usuario ya no existe', async () => {
      const { servicio, findById } = crearServicio();
      findById.mockResolvedValue(null);

      await expect(servicio.obtenerPerfil('665f1c2e9b1d4a0012ab34cd')).rejects.toThrow(
        new UnauthorizedException('Sesión inválida o vencida'),
      );
    });
  });

  describe('loginDePrueba', () => {
    it('abre sesión del usuario de prueba fijo sin verificar ningún token', async () => {
      const { servicio, verifyIdToken, findOneAndUpdate, generar } = crearServicio();

      const respuesta = await servicio.loginDePrueba();

      expect(verifyIdToken).not.toHaveBeenCalled();
      expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ firebaseUid: 'dev-session-user' });
      expect(findOneAndUpdate.mock.calls[0][1]).toEqual({
        $setOnInsert: { nombre: 'Usuario de prueba', email: 'prueba@aequo.local', fotoUrl: null },
      });
      expect(generar).toHaveBeenCalledWith(usuarioGuardado.id);
      expect(respuesta.accessToken).toBe('jwt-propio');
    });
  });

  describe('verificarIdToken', () => {
    it.each(['auth/argument-error', 'auth/id-token-expired', 'auth/id-token-revoked'])(
      'responde 401 si Firebase rechaza el token (%s)',
      async (code) => {
        const { servicio, verifyIdToken, findOneAndUpdate } = crearServicio();
        verifyIdToken.mockRejectedValue(Object.assign(new Error('x'), { code }));

        await expect(servicio.login('malo')).rejects.toThrow(
          new UnauthorizedException('ID Token inválido o vencido'),
        );
        expect(findOneAndUpdate).not.toHaveBeenCalled();
      },
    );

    it('responde 401 si el token no trae correo', async () => {
      const { servicio, verifyIdToken } = crearServicio();
      verifyIdToken.mockResolvedValue({ uid: 'uid-3' });

      await expect(servicio.login('sin-correo')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('propaga los errores que no son de token (no los disfraza de 401)', async () => {
      const { servicio, verifyIdToken } = crearServicio();
      const falloRed = Object.assign(new Error('red caída'), { code: 'app/network-error' });
      verifyIdToken.mockRejectedValue(falloRed);

      await expect(servicio.login('token')).rejects.toBe(falloRed);
    });
  });
});
