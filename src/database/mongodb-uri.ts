export const BASE_DE_DATOS = 'aequo';

interface MongoConexion {
  usuario: string;
  clave: string;
  host: string;
}

/** Arma la URI de Atlas; usuario y clave se codifican, así que pueden tener caracteres especiales. */
export function construirMongoUri({ usuario, clave, host }: MongoConexion): string {
  return `mongodb+srv://${encodeURIComponent(usuario)}:${encodeURIComponent(clave)}@${host}/${BASE_DE_DATOS}?retryWrites=true&w=majority`;
}
