import { UnauthorizedException } from '@nestjs/common';
import { AuthService, SESION_SEGUNDOS } from './auth.service.js';

const usuarioGuardado = {
  id: '665f1c2e9b1d4a0012ab34cd',
  nombre: 'Wilhen',
  email: 'wilhen@gmail.com',
  fotoUrl: 'https://foto/1.png',
};

function crearServicio() {
  const verifyIdToken = vi.fn();
  const orFail = vi.fn().mockResolvedValue(usuarioGuardado);
  const findOneAndUpdate = vi.fn().mockReturnValue({ orFail });
  const sign = vi.fn().mockReturnValue('jwt-propio');
  const servicio = new AuthService(
    { findOneAndUpdate } as never,
    { sign } as never,
    { verifyIdToken } as never,
  );
  return { servicio, verifyIdToken, findOneAndUpdate, sign };
}

describe('AuthService', () => {
  describe('login', () => {
    it('crea o recupera al usuario por UID y devuelve un JWT propio de 24 h', async () => {
      const { servicio, verifyIdToken, findOneAndUpdate, sign } = crearServicio();
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
      expect(sign).toHaveBeenCalledWith({ sub: usuarioGuardado.id });
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
