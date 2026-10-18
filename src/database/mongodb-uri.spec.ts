import { construirMongoUri } from './mongodb-uri.js';

describe('construirMongoUri', () => {
  it('arma la URI de Atlas con la base aequo', () => {
    expect(
      construirMongoUri({ usuario: 'aequo_user', clave: 'abc123', host: 'cluster0.ab1cd.mongodb.net' }),
    ).toBe(
      'mongodb+srv://aequo_user:abc123@cluster0.ab1cd.mongodb.net/aequo?retryWrites=true&w=majority',
    );
  });

  it('codifica los caracteres especiales de usuario y clave', () => {
    const uri = construirMongoUri({
      usuario: 'ana@mail',
      clave: 'p@ss:w/rd#?%',
      host: 'cluster0.ab1cd.mongodb.net',
    });

    expect(uri).toContain('ana%40mail:p%40ss%3Aw%2Frd%23%3F%25@cluster0');
    expect(new URL(uri).password).toBe('p%40ss%3Aw%2Frd%23%3F%25');
  });
});
