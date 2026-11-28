import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import mongoose from 'mongoose';
import {
  cuerpoDeError,
  dia,
  type Doc,
  errorDeClaveDuplicada,
  type Metodo,
  type Opciones,
  OTRO_USUARIO_ID,
  USUARIO_ID,
  usarEntornoErrores,
} from '../../test/errores/arnes-errores.js';
import { calcularHuella } from '../idempotencia/huella.js';

// Paquete 8.3.8: toda respuesta de error es `{ statusCode, error, message, code, action? }` (criterios/08-errores.md).
const ObjectId = mongoose.Types.ObjectId;
const AJENO = new ObjectId(OTRO_USUARIO_ID);
const INEXISTENTE = '665f1c2e9b1d4a0012ab0000';

const REVISA = 'Revisa los datos marcados';
const VUELVE_A_ENTRAR = 'Vuelve a iniciar sesión';
const REINTENTA_LUEGO = 'Inténtalo de nuevo en unos minutos';
const ACTUALIZA = 'Actualiza la lista: puede que ya se haya eliminado';

describe('Formato de las respuestas de error (integración)', () => {
  const e = usarEntornoErrores();

  /** Una petición lista para enviarse más tarde, después de sembrar y de fotografiar la base. */
  const peticion = (metodo: Metodo, ruta: string, cuerpo?: unknown, opciones?: Opciones) => () =>
    e.enviar(metodo, ruta, cuerpo, opciones);
  type Peticion = ReturnType<typeof peticion>;

  const tarjetaNueva = (cambios: Doc = {}) => ({ nombre: 'Visa', tasaEA: 0.2921, ...cambios });

  describe('forma por familia de error', () => {
    const movimiento = () => ({
      tipo: 'EGRESO',
      monto: 0,
      fecha: '2026-11-10',
      categoriaId: e.hogar.id,
      metodoPago: 'EFECTIVO',
    });

    it.each<[string, () => Peticion | Promise<Peticion>, string[]]>([
      ['el cuerpo', () => peticion('post', '/transacciones', movimiento()), ['monto debe ser mayor que cero']],
      [
        'un campo no declarado',
        () => peticion('post', '/tarjetas', tarjetaNueva({ sobrante: 1 })),
        ['property sobrante should not exist'],
      ],
      ['la query', () => peticion('get', '/transacciones?limite=0'), ['limite debe ser un entero entre 1 y 100']],
      ['un id de la ruta', () => peticion('get', '/tarjetas/abc'), ['id debe ser un id de tarjeta válido']],
      [
        'la cabecera X-Zona-Horaria',
        () => peticion('get', '/reportes/periodo', undefined, { cabeceras: { 'X-Zona-Horaria': 'Marte/Base' } }),
        ['X-Zona-Horaria debe ser un nombre de zona horaria IANA válido, por ejemplo America/Bogota'],
      ],
      [
        'la cabecera Idempotency-Key',
        () => peticion('post', '/tarjetas', tarjetaNueva(), { cabeceras: { 'Idempotency-Key': 'abc' } }),
        ['Idempotency-Key debe ser un UUID (por ejemplo, el de crypto.randomUUID())'],
      ],
      [
        'un PATCH sin ningún campo',
        async () => peticion('patch', `/tarjetas/${await e.sembrarTarjeta()}`, {}),
        ['Debes enviar al menos un campo para modificar'],
      ],
      [
        'desde posterior a hasta',
        () => peticion('get', '/reportes/periodo?desde=2026-11-10&hasta=2026-11-01'),
        ['desde no puede ser posterior a hasta'],
      ],
      [
        'el login sin idToken',
        () => peticion('post', '/auth/login', {}, { token: null }),
        ['idToken should not be empty', 'idToken must be a string'],
      ],
    ])('CA-ERR-01 responde 400 VALIDACION ante un dato inválido: %s', async (_caso, preparar, mensajes) => {
      const enviar = await preparar();
      const antes = e.foto();

      const { status, body } = await enviar();

      expect(status).toBe(400);
      expect(body.message).toHaveLength(mensajes.length);
      expect(body.message).toEqual(expect.arrayContaining(mensajes));
      expect(e.foto()).toEqual(antes);
      expect(body).toStrictEqual(cuerpoDeError(400, body.message, 'VALIDACION', REVISA));
    });

    it.each<[string, () => Opciones]>([
      ['sin token', () => ({ token: null })],
      ['con un token manipulado', () => ({ token: `${e.token}x` })],
      ['con un token vencido', () => ({ token: e.tokenVencido() })],
    ])('CA-ERR-02 una ruta protegida %s responde 401 SESION_INVALIDA', async (_caso, opciones) => {
      const { status, body } = await e.enviar('get', '/tarjetas', undefined, opciones());

      expect(status).toBe(401);
      expect(body.message).toBe('Sesión inválida o vencida');
      expect(body).toStrictEqual(cuerpoDeError(401, body.message, 'SESION_INVALIDA', VUELVE_A_ENTRAR));
    });

    it('CA-ERR-02 el token de un usuario que ya no existe responde 401 SESION_INVALIDA', async () => {
      const { status, body } = await e.enviar('get', '/usuarios/me');

      expect(status).toBe(401);
      expect(body.message).toBe('Sesión inválida o vencida');
      expect(body).toStrictEqual(cuerpoDeError(401, body.message, 'SESION_INVALIDA', VUELVE_A_ENTRAR));
    });

    it.each<[string, () => void]>([
      [
        'Firebase rechaza el ID Token',
        () => e.verifyIdToken.mockRejectedValue(Object.assign(new Error('malo'), { code: 'auth/id-token-expired' })),
      ],
      ['el token no trae correo', () => e.verifyIdToken.mockResolvedValue({ uid: 'uid-1' })],
    ])('CA-ERR-03 si %s, el login responde 401 TOKEN_GOOGLE_INVALIDO', async (_caso, preparar) => {
      preparar();

      const { status, body } = await e.enviar('post', '/auth/login', { idToken: 'x' }, { token: null });

      expect(status).toBe(401);
      expect(body.message).toBe('ID Token inválido o vencido');
      expect(body).toStrictEqual(
        cuerpoDeError(401, body.message, 'TOKEN_GOOGLE_INVALIDO', 'Intenta iniciar sesión de nuevo'),
      );
    });
  });

  describe('CA-ERR-04: catálogo de no encontrados y reglas de negocio', () => {
    interface Fila {
      code: string;
      status: number;
      action?: string;
      /** Siembra lo necesario y devuelve las situaciones de la fila: cada petición con el `message` de hoy. */
      preparar(): Promise<Array<[Peticion, string]>>;
    }

    /** Un recurso de otro usuario y uno inexistente: deben responder exactamente lo mismo. */
    const ajenoEInexistente = (
      metodo: Metodo,
      ruta: (id: string) => string,
      idAjeno: string,
      mensaje: string,
      cuerpo?: unknown,
    ): Array<[Peticion, string]> => [
      [peticion(metodo, ruta(idAjeno), cuerpo), mensaje],
      [peticion(metodo, ruta(INEXISTENTE), cuerpo), mensaje],
    ];

    const compra = (categoriaId: string) => ({
      descripcion: 'Televisor',
      categoriaId,
      valor: 1254700,
      cuotas: 12,
      primerPago: '2026-12',
      fecha: '2026-11-10',
    });
    const prestamo = (cambios: Doc = {}) => ({
      acreedor: 'Juan Pérez',
      monto: 200000,
      fecha: '2026-11-20',
      ...cambios,
    });
    const meta = { tipoMeta: 'PORCENTAJE', valorObjetivo: 20 };
    const deOtroModulo = (accion: string) =>
      `Esta transacción la genera otro módulo (tarjetas o deudas) y no se puede ${accion} desde aquí`;

    const noEncontrados: Fila[] = [
      {
        code: 'CATEGORIA_NO_ENCONTRADA',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const ajena = await e.sembrarCategoria('Ajena', { usuarioId: AJENO });
          const tarjeta = await e.sembrarTarjeta();
          const mensaje = 'Categoría no encontrada';
          return [
            ...ajenoEInexistente('patch', (id) => `/categorias/${id}`, ajena, mensaje, { nombre: 'Nueva' }),
            ...ajenoEInexistente('delete', (id) => `/categorias/${id}`, ajena, mensaje),
            [peticion('post', `/tarjetas/${tarjeta}/compras`, compra(ajena)), mensaje],
            [peticion('post', `/tarjetas/${tarjeta}/compras`, compra(INEXISTENTE)), mensaje],
          ];
        },
      },
      {
        code: 'TRANSACCION_NO_ENCONTRADA',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const ajena = await e.sembrarTransaccion({ usuarioId: AJENO });
          const mensaje = 'Transacción no encontrada';
          return [
            ...ajenoEInexistente('patch', (id) => `/transacciones/${id}`, ajena, mensaje, { monto: 5000 }),
            ...ajenoEInexistente('delete', (id) => `/transacciones/${id}`, ajena, mensaje),
          ];
        },
      },
      {
        code: 'META_NO_ENCONTRADA',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const ajena = await e.sembrar(e.metas, { ...meta, periodo: dia('2026-11-01'), usuarioId: AJENO });
          return ajenoEInexistente('get', (id) => `/ahorro/metas/${id}`, ajena, 'Meta de ahorro no encontrada');
        },
      },
      {
        code: 'TARJETA_NO_ENCONTRADA',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const ajena = await e.sembrarTarjeta({ usuarioId: AJENO });
          const mensaje = 'Tarjeta no encontrada';
          return [
            ...ajenoEInexistente('get', (id) => `/tarjetas/${id}`, ajena, mensaje),
            ...ajenoEInexistente('get', (id) => `/tarjetas/${id}/compras`, ajena, mensaje),
          ];
        },
      },
      {
        code: 'CARGO_NO_ENCONTRADO',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const propia = await e.sembrarTarjeta();
          const ajena = await e.sembrarTarjeta({ usuarioId: AJENO });
          const cargo = await e.sembrar(e.cargos, {
            tarjetaId: ajena,
            descripcion: 'Netflix',
            valor: 38900,
            usuarioId: AJENO,
          });
          return ajenoEInexistente(
            'get',
            (id) => `/tarjetas/${propia}/cargos/${id}`,
            cargo,
            'Cargo fijo no encontrado',
          );
        },
      },
      {
        code: 'COMPRA_NO_ENCONTRADA',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const propia = await e.sembrarTarjeta();
          const ajena = await e.sembrarTarjeta({ usuarioId: AJENO });
          const deOtro = await e.sembrarCompra(ajena, { usuarioId: AJENO });
          return ajenoEInexistente('get', (id) => `/tarjetas/${propia}/compras/${id}`, deOtro, 'Compra no encontrada');
        },
      },
      {
        code: 'PAGO_NO_ENCONTRADO',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const propia = await e.sembrarTarjeta();
          const ajena = await e.sembrarTarjeta({ usuarioId: AJENO });
          const pago = await e.sembrarTransaccion({
            usuarioId: AJENO,
            categoriaId: null,
            clasificacionFlujo: 'PAGO_TARJETA',
            tarjetaId: ajena,
          });
          return ajenoEInexistente('delete', (id) => `/tarjetas/${propia}/pagos/${id}`, pago, 'Pago no encontrado');
        },
      },
      {
        code: 'DEUDA_NO_ENCONTRADA',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const ajena = await e.sembrarDeuda({ usuarioId: AJENO });
          const deOtro = await e.sembrarPrestamo(ajena, { usuarioId: AJENO });
          return ajenoEInexistente('delete', (id) => `/deudas/${id}/prestamos/${deOtro}`, ajena, 'Deuda no encontrada');
        },
      },
      {
        code: 'PRESTAMO_NO_ENCONTRADO',
        status: 404,
        action: ACTUALIZA,
        preparar: async () => {
          const propia = await e.sembrarDeuda();
          await e.sembrarPrestamo(propia);
          const ajena = await e.sembrarDeuda({ usuarioId: AJENO });
          const deOtro = await e.sembrarPrestamo(ajena, { usuarioId: AJENO });
          return ajenoEInexistente(
            'delete',
            (id) => `/deudas/${propia}/prestamos/${id}`,
            deOtro,
            'Préstamo no encontrado',
          );
        },
      },
    ];

    const reglas: Fila[] = [
      {
        code: 'CATEGORIA_PREDETERMINADA',
        status: 403,
        action: 'Crea una categoría propia si necesitas otra',
        preparar: async () => [
          [
            peticion('patch', `/categorias/${e.hogar.id}`, { nombre: 'Casa' }),
            'Las categorías generales no se pueden modificar',
          ],
          [peticion('delete', `/categorias/${e.hogar.id}`), 'Las categorías generales no se pueden eliminar'],
        ],
      },
      {
        code: 'CATEGORIA_DUPLICADA',
        status: 409,
        action: 'Usa otro nombre o la categoría que ya existe',
        preparar: async () => {
          const propia = await e.sembrarCategoria('Mascotas');
          const mensaje = 'Ya existe una categoría con ese nombre';
          return [
            [peticion('post', '/categorias', { nombre: 'Hogar', tipo: 'EGRESO' }), mensaje],
            [peticion('patch', `/categorias/${propia}`, { nombre: 'Hogar' }), mensaje],
          ];
        },
      },
      {
        code: 'META_DUPLICADA',
        status: 409,
        action: 'Edita la meta de ese mes',
        preparar: async () => {
          await e.sembrar(e.metas, { ...meta, periodo: dia('2026-11-01') });
          return [
            [
              peticion('post', '/ahorro/metas', { ...meta, periodo: '2026-11' }),
              'Ya existe una meta de ahorro para ese mes',
            ],
          ];
        },
      },
      {
        code: 'META_CON_AHORRO',
        status: 409,
        action: 'Deja el ahorro del mes en 0 antes de eliminarla',
        preparar: async () => {
          const id = await e.sembrar(e.metas, { ...meta, periodo: dia('2026-11-01'), ahorroReal: 1000 });
          return [
            [peticion('delete', `/ahorro/metas/${id}`), 'No se puede eliminar una meta que ya tiene ahorro registrado'],
          ];
        },
      },
      {
        code: 'TARJETA_DUPLICADA',
        status: 409,
        action: 'Usa otro nombre',
        preparar: async () => {
          await e.sembrarTarjeta();
          return [[peticion('post', '/tarjetas', tarjetaNueva()), 'Ya existe una tarjeta con ese nombre']];
        },
      },
      {
        code: 'TARJETA_CON_COMPRAS',
        status: 409,
        preparar: async () => {
          const tarjeta = await e.sembrarTarjeta();
          await e.sembrarCompra(tarjeta);
          return [
            [
              peticion('delete', `/tarjetas/${tarjeta}`),
              'No se puede eliminar una tarjeta que ya tiene compras registradas',
            ],
          ];
        },
      },
      {
        code: 'TARJETA_CON_PAGOS',
        status: 409,
        action: 'Elimina primero sus pagos',
        preparar: async () => {
          const tarjeta = await e.sembrarTarjeta();
          await e.sembrarTransaccion({
            categoriaId: null,
            clasificacionFlujo: 'PAGO_TARJETA',
            tarjetaId: tarjeta,
          });
          return [
            [
              peticion('delete', `/tarjetas/${tarjeta}`),
              'No se puede eliminar una tarjeta que ya tiene pagos registrados',
            ],
          ];
        },
      },
      {
        code: 'TRANSACCION_DE_OTRO_MODULO',
        status: 409,
        action: 'Gestiónalo desde la tarjeta o la deuda',
        preparar: async () => {
          const id = await e.sembrarPrestamo(await e.sembrarDeuda());
          return [
            [peticion('patch', `/transacciones/${id}`, { monto: 5000 }), deOtroModulo('modificar')],
            [peticion('delete', `/transacciones/${id}`), deOtroModulo('eliminar')],
          ];
        },
      },
      {
        code: 'DEUDA_INTERES_DISTINTO',
        status: 409,
        action: 'Deja el interés en blanco para conservar el que ya tiene la deuda',
        preparar: async () => {
          await e.sembrarPrestamo(await e.sembrarDeuda({ tipoInteres: 'TASA', valorInteres: 0.02 }));
          return [
            [
              peticion('post', '/deudas/prestamos', prestamo({ tipoInteres: 'TASA', valorInteres: 0.03 })),
              'Ya tienes una deuda activa con esa persona con otro interés: no indiques el interés o envía el mismo',
            ],
          ];
        },
      },
      {
        code: 'DEUDA_REGISTRO_SIMULTANEO',
        status: 409,
        action: 'Vuelve a intentarlo',
        preparar: async () => {
          vi.spyOn(e.deudas, 'create').mockRejectedValue(errorDeClaveDuplicada());
          return [
            [
              peticion('post', '/deudas/prestamos', prestamo()),
              'Ya se está registrando un préstamo de esa persona: vuelve a intentarlo',
            ],
          ];
        },
      },
      {
        code: 'DEUDA_CON_ABONOS',
        status: 409,
        preparar: async () => {
          const deuda = await e.sembrarDeuda();
          const id = await e.sembrarPrestamo(deuda);
          await e.sembrarTransaccion({ categoriaId: null, clasificacionFlujo: 'ABONO_DEUDA', deudaId: deuda });
          return [
            [
              peticion('delete', `/deudas/${deuda}/prestamos/${id}`),
              'No puedes eliminar el único préstamo de una deuda con abonos',
            ],
          ];
        },
      },
      {
        code: 'IDEMPOTENCIA_EN_PROCESO',
        status: 409,
        action: 'Espera un momento antes de reintentar',
        preparar: async () => {
          const clave = randomUUID();
          // La clave de una primera petición idéntica que todavía no termina.
          await e.claves.create({
            usuarioId: new ObjectId(USUARIO_ID),
            clave,
            huella: calcularHuella('POST', '/tarjetas', tarjetaNueva()),
            estado: 'EN_PROCESO',
          });
          return [
            [
              peticion('post', '/tarjetas', tarjetaNueva(), { cabeceras: { 'Idempotency-Key': clave } }),
              'La petición ya se está procesando: espera su resultado antes de reintentar',
            ],
          ];
        },
      },
      {
        code: 'IDEMPOTENCIA_CLAVE_REUTILIZADA',
        status: 422,
        preparar: async () => {
          const opciones = { cabeceras: { 'Idempotency-Key': randomUUID() } };
          await e.enviar('post', '/tarjetas', tarjetaNueva(), opciones).expect(201);
          return [
            [
              peticion('post', '/tarjetas', tarjetaNueva({ nombre: 'Otra' }), opciones),
              'La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva',
            ],
          ];
        },
      },
    ];

    it.each([...noEncontrados, ...reglas])('CA-ERR-04 $code ($status)', async ({ code, status, action, preparar }) => {
      const situaciones = await preparar();
      const antes = e.foto();

      const respuestas = [];
      for (const [enviar, mensaje] of situaciones) respuestas.push({ respuesta: await enviar(), mensaje });

      for (const { respuesta, mensaje } of respuestas) {
        expect(respuesta.status).toBe(status);
        expect(respuesta.body.message).toBe(mensaje);
      }
      expect(e.foto()).toEqual(antes);
      for (const { respuesta, mensaje } of respuestas) {
        expect(respuesta.body).toStrictEqual(cuerpoDeError(status, mensaje, code, action));
      }
    });
  });

  describe('errores del framework', () => {
    it.each<[string, Metodo, string, Opciones]>([
      ['una ruta que no existe, sin sesión', 'get', '/nada', { token: null }],
      ['una ruta que no existe, con sesión', 'get', '/nada', {}],
      ['un método no registrado en una ruta que existe', 'delete', '/tarjetas', {}],
    ])('CA-ERR-05 %s responde 404 RUTA_NO_ENCONTRADA', async (_caso, metodo, ruta, opciones) => {
      const { status, body } = await e.enviar(metodo, ruta, undefined, opciones);

      expect(status).toBe(404);
      expect(body.message).toBe(`Cannot ${metodo.toUpperCase()} ${ruta}`);
      expect(body).toStrictEqual(cuerpoDeError(404, body.message, 'RUTA_NO_ENCONTRADA'));
    });

    /** El texto que da el analizador de JSON de esta versión de Node para el mismo cuerpo. */
    const errorDelAnalizador = (texto: string): string => {
      try {
        JSON.parse(texto);
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    };

    it.each<[string, number, string, string, string]>([
      ['JSON mal formado', 400, 'application/json', '{"a":', errorDelAnalizador('{"a":')],
      [
        'un cuerpo de más de 100 KB',
        413,
        'application/json',
        JSON.stringify({ nombre: 'x'.repeat(110_000) }),
        'request entity too large',
      ],
      [
        'un juego de caracteres no admitido',
        415,
        'application/json; charset=latin9',
        '{}',
        'unsupported charset "LATIN9"',
      ],
    ])('CA-ERR-06 %s responde %i ERROR_HTTP', async (_caso, esperado, tipo, cuerpo, mensaje) => {
      const antes = e.foto();

      const { status, body } = await e.enviar('post', '/tarjetas', cuerpo, { cabeceras: { 'Content-Type': tipo } });

      expect(status).toBe(esperado);
      expect(body.message).toBe(mensaje);
      expect(e.foto()).toEqual(antes);
      expect(body).toStrictEqual(cuerpoDeError(esperado, mensaje, 'ERROR_HTTP'));
    });
  });

  describe('fallos del servidor', () => {
    const SECRETO = 'fallo secreto mongodb://usuario:clave@host';

    const espiarLog = () => vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    /** Todo lo que se escribió en el log en nivel `error`, como texto. */
    const textoDelLog = (espia: ReturnType<typeof espiarLog>) =>
      espia.mock.calls
        .flat()
        .map((dato: unknown) => {
          if (dato instanceof Error) return `${dato.message}\n${dato.stack}`;
          return typeof dato === 'string' ? dato : JSON.stringify(dato);
        })
        .join('\n');

    const fallo = () => {
      throw new TypeError(SECRETO);
    };

    it.each<[string, () => unknown]>([
      [
        'la base al consultar',
        () => {
          vi.spyOn(e.tarjetas, 'find').mockImplementation(fallo);
          return e.enviar('get', '/tarjetas');
        },
      ],
      [
        'la base al guardar',
        () => {
          vi.spyOn(e.tarjetas, 'create').mockImplementation(fallo);
          return e.enviar('post', '/tarjetas', tarjetaNueva());
        },
      ],
      [
        'Firebase en el login, con un error que no es del token',
        () => {
          e.verifyIdToken.mockRejectedValue(Object.assign(new Error(SECRETO), { code: 'app/network-error' }));
          return e.enviar('post', '/auth/login', { idToken: 'x' }, { token: null });
        },
      ],
    ])('CA-ERR-07 si falla %s responde 500 sin detalles y lo registra', async (_caso, enviar) => {
      const log = espiarLog();

      const { status, body } = (await enviar()) as { status: number; body: Doc };

      expect(status).toBe(500);
      expect(textoDelLog(log)).toContain(SECRETO);
      expect(body).toStrictEqual(cuerpoDeError(500, 'Internal server error', 'ERROR_INTERNO', REINTENTA_LUEGO));
    });

    it('CA-ERR-08 sin categoría de respaldo responde el 500 genérico, registra el motivo y no borra nada', async () => {
      const propia = await e.sembrarCategoria('Mascotas');
      e.categorias.registros = e.categorias.registros.filter((categoria) => !categoria.esRespaldo);
      const log = espiarLog();

      const { status, body } = await e.enviar('delete', `/categorias/${propia}`);

      expect(status).toBe(500);
      expect(e.categorias.docs.map((categoria) => String(categoria._id))).toContain(propia);
      expect(body.message).toBe('Internal server error');
      expect(textoDelLog(log)).toContain('No existe la categoría general de respaldo de EGRESO');
      expect(body).toStrictEqual(cuerpoDeError(500, body.message, 'ERROR_INTERNO', REINTENTA_LUEGO));
    });
  });

  describe('lo que no cambia', () => {
    const tarjetaDevuelta = {
      id: expect.any(String),
      nombre: 'Visa',
      tasaEA: 0.2921,
      cuotaUnicaSinInteres: false,
      creadaEn: expect.any(String),
      actualizadaEn: expect.any(String),
    };

    it('CA-ERR-09 las respuestas 200, 201 y 204 y la repetición idempotente son las de hoy', async () => {
      const opciones = { cabeceras: { 'Idempotency-Key': randomUUID() } };

      const primera = await e.enviar('post', '/tarjetas', tarjetaNueva(), opciones);
      const repetida = await e.enviar('post', '/tarjetas', tarjetaNueva(), opciones);
      const listado = await e.enviar('get', '/tarjetas');
      const borrado = await e.enviar('delete', `/tarjetas/${primera.body.id}`);

      expect(primera.status).toBe(201);
      expect(primera.body).toStrictEqual(tarjetaDevuelta);
      expect(repetida.status).toBe(201);
      expect(repetida.body).toStrictEqual(primera.body);
      expect(repetida.headers['idempotent-replayed']).toBe('true');
      expect(listado.status).toBe(200);
      expect(listado.body).toStrictEqual({ items: [primera.body] });
      expect(borrado.status).toBe(204);
      expect(borrado.text).toBe('');
    });

    it('CA-ERR-09 una petición que falló sigue liberando su clave de idempotencia', async () => {
      const opciones = { cabeceras: { 'Idempotency-Key': randomUUID() } };

      const mala = await e.enviar('post', '/tarjetas', tarjetaNueva({ tasaEA: 2 }), opciones);
      const corregida = await e.enviar('post', '/tarjetas', tarjetaNueva(), opciones);

      expect(mala.status).toBe(400);
      expect(corregida.status).toBe(201);
      expect(corregida.body).toStrictEqual(tarjetaDevuelta);
      expect(corregida.headers['idempotent-replayed']).toBeUndefined();
    });
  });
});
