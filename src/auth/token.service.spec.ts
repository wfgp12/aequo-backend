import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MENSAJE_SESION_INVALIDA, TokenService } from './token.service.js';

const SECRETO = 'secreto-solo-para-pruebas';
const USUARIO_ID = '665f1c2e9b1d4a0012ab34cd';

// Misma configuración que AuthModule: solo HS256 y vigencia de 24 h.
const crearJwt = (secret = SECRETO) =>
  new JwtService({
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: 86400 },
    verifyOptions: { algorithms: ['HS256'] },
  });

const codificar = (objeto: object) => Buffer.from(JSON.stringify(objeto)).toString('base64url');

describe('TokenService', () => {
  const tokens = new TokenService(crearJwt());

  const esperarRechazo = (token: string) =>
    expect(tokens.validar(token)).rejects.toThrow(new UnauthorizedException(MENSAJE_SESION_INVALIDA));

  describe('generar', () => {
    it('emite un JWT cuyo payload lleva el id del usuario y vence en 24 h', async () => {
      const token = tokens.generar(USUARIO_ID);

      const payload = await crearJwt().verifyAsync(token);
      expect(payload.sub).toBe(USUARIO_ID);
      expect(payload.exp - payload.iat).toBe(86400);
    });
  });

  describe('validar', () => {
    it('acepta un token emitido por el propio servicio y devuelve el id del usuario', async () => {
      await expect(tokens.validar(tokens.generar(USUARIO_ID))).resolves.toEqual({
        usuarioId: USUARIO_ID,
      });
    });

    it('rechaza un token vencido', async () => {
      const vencido = crearJwt().sign({ sub: USUARIO_ID }, { expiresIn: -10 });

      await esperarRechazo(vencido);
    });

    it('rechaza un token manipulado (payload cambiado con la firma original)', async () => {
      const [cabecera, , firma] = tokens.generar(USUARIO_ID).split('.');
      const manipulado = [cabecera, codificar({ sub: 'otro-usuario', exp: 9999999999 }), firma].join('.');

      await esperarRechazo(manipulado);
    });

    it('rechaza un token firmado con otro secreto', async () => {
      await esperarRechazo(crearJwt('otro-secreto').sign({ sub: USUARIO_ID }));
    });

    it('rechaza un token sin firma con algoritmo "none"', async () => {
      const sinFirma = `${codificar({ alg: 'none', typ: 'JWT' })}.${codificar({ sub: USUARIO_ID })}.`;

      await esperarRechazo(sinFirma);
    });

    it('rechaza un token válido que no trae `sub`', async () => {
      await esperarRechazo(crearJwt().sign({ otro: 'dato' }));
    });

    it.each(['', 'no-es-un-jwt', 'a.b.c'])('rechaza un texto que no es un JWT (%j)', async (basura) => {
      await esperarRechazo(basura);
    });

    it('usa el mismo mensaje en todos los casos, sin dar pistas del motivo', async () => {
      const vencido = crearJwt().sign({ sub: USUARIO_ID }, { expiresIn: -10 });

      const errores = await Promise.all(
        [vencido, 'basura'].map((t) => tokens.validar(t).catch((e: UnauthorizedException) => e.message)),
      );

      expect(new Set(errores)).toEqual(new Set([MENSAJE_SESION_INVALIDA]));
    });
  });
});
