import {
  OTRO_USUARIO_ID,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';
import { pagosGuardados } from '../../test/tarjetas/escenario-pagos.js';

// Paquete 5.3.2 (RF-32): los datos del pago: fecha, valor, método de pago, descripción y campos no declarados.
describe('POST /tarjetas/:tarjetaId/pagos: validación del cuerpo (integración)', () => {
  const e = usarEntornoCompras();

  /** El pago base sin la propiedad `fecha` (el cuerpo no la trae). */
  const sinFecha = () => {
    const { fecha: _fecha, ...resto } = e.pagoBase({ valor: 1000 });
    return resto;
  };

  it('CA-RF32-11 sin fecha, el pago es de hoy en la zona del cliente', async () => {
    e.hoyEs('2026-12-01T02:00:00.000Z');
    const visa = await e.sembrarTarjeta();

    const sinHeader = await e.crearPago(visa, sinFecha());
    const enBogota = await e.crearPago(visa, sinFecha(), {
      zona: 'America/Bogota',
    });

    expect(sinHeader.status).toBe(201);
    expect(sinHeader.body.fecha).toBe('2026-12-01');
    expect(sinHeader.body.comparacion.mes).toBe('2026-12');
    expect(enBogota.status).toBe(201);
    expect(enBogota.body.fecha).toBe('2026-11-30');
    expect(enBogota.body.comparacion.mes).toBe('2026-11');
    expect(pagosGuardados(e).map((doc) => doc.fecha.toISOString())).toEqual([
      '2026-12-01T00:00:00.000Z',
      '2026-11-30T00:00:00.000Z',
    ]);
  });

  it.each(['2020-01-15', '2099-12-31', '2028-02-29'])(
    'CA-RF32-12 la fecha %s (pasada, futura o bisiesta) se acepta y se guarda a las 00:00 UTC',
    async (fecha) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearPago(visa, e.pagoBase({ fecha }));

      expect(status).toBe(201);
      expect(body.fecha).toBe(fecha);
      expect(pagosGuardados(e)[0].fecha.toISOString()).toBe(
        `${fecha}T00:00:00.000Z`,
      );
    },
  );

  it.each([
    'ayer',
    '2026-13-01',
    '2026-02-30',
    '2027-02-29',
    '2026/12/05',
    '2026-12-5',
    '2026-12-05T10:00:00Z',
    20261205,
    null,
    '',
  ])('CA-RF32-13 la fecha %j responde 400 y no guarda nada', async (fecha) => {
    const visa = await e.sembrarTarjeta();

    const { status, body } = await e.crearPago(visa, e.pagoBase({ fecha }));

    expect(status).toBe(400);
    expect(Array.isArray(body.message)).toBe(true);
    expect(mensajeDeCampo(body, 'fecha')).toBe(true);
    expect(e.transacciones.docs).toHaveLength(0);
  });

  it.each([
    ['sin valor', undefined],
    ['0', 0],
    ['-1', -1],
    ['-0.01', -0.01],
    ['un texto', '300000'],
    ['null', null],
    ['un lógico', true],
    ['un arreglo', []],
    ['un objeto', {}],
  ])(
    'CA-RF32-14 el valor %s responde 400 y no guarda nada',
    async (_caso, valor) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearPago(visa, e.pagoBase({ valor }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'valor')).toBe(true);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );

  it.each([300000.5, 0.01, 1234.56])(
    'CA-RF32-15 el valor %s (hasta dos decimales) se acepta y se guarda exacto',
    async (valor) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearPago(visa, e.pagoBase({ valor }));

      expect(status).toBe(201);
      expect(body.valor).toBe(valor);
      expect(pagosGuardados(e)[0].monto).toBe(valor);
    },
  );

  it.each([0.001, 100.555])(
    'CA-RF32-15 el valor %s (más de dos decimales) responde 400 y no guarda nada',
    async (valor) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearPago(visa, e.pagoBase({ valor }));

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'valor')).toBe(true);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );

  it('CA-RF32-16 el valor tiene un tope: 999.999.999.999 sí, un billón no', async () => {
    const visa = await e.sembrarTarjeta();

    const enElTope = await e.crearPago(
      visa,
      e.pagoBase({ valor: 999999999999 }),
    );
    const pasado = await e.crearPago(
      visa,
      e.pagoBase({ valor: 1000000000000 }),
    );

    expect(enElTope.status).toBe(201);
    expect(enElTope.body.valor).toBe(999999999999);
    expect(pasado.status).toBe(400);
    expect(mensajeDeCampo(pasado.body, 'valor')).toBe(true);
    expect(pagosGuardados(e)).toHaveLength(1);
  });

  it('CA-RF32-17 sin método de pago, el pago es por TRANSFERENCIA', async () => {
    const visa = await e.sembrarTarjeta();
    const { metodoPago: _metodo, ...sinMetodo } = e.pagoBase();

    const { status, body } = await e.crearPago(visa, sinMetodo);

    expect(status).toBe(201);
    expect(body.metodoPago).toBe('TRANSFERENCIA');
    expect(pagosGuardados(e)[0].metodoPago).toBe('TRANSFERENCIA');
  });

  it.each(['EFECTIVO', 'DEBITO', 'TRANSFERENCIA'])(
    'CA-RF32-17 el método de pago %s se acepta y se guarda',
    async (metodoPago) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearPago(
        visa,
        e.pagoBase({ metodoPago }),
      );

      expect(status).toBe(201);
      expect(body.metodoPago).toBe(metodoPago);
      expect(pagosGuardados(e)[0].metodoPago).toBe(metodoPago);
    },
  );

  it.each(['TARJETA_CREDITO', 'PSE', 'transferencia', '', 5, null])(
    'CA-RF32-17 el método de pago %j responde 400 y no guarda nada',
    async (metodoPago) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearPago(
        visa,
        e.pagoBase({ metodoPago }),
      );

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'metodoPago')).toBe(true);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );

  it('CA-RF32-18 la descripción: por defecto «Pago de tarjeta», recortada y hasta 200 caracteres', async () => {
    const visa = await e.sembrarTarjeta();
    const { descripcion: _descripcion, ...sinDescripcion } = e.pagoBase();

    const porDefecto = await e.crearPago(visa, sinDescripcion);
    const recortada = await e.crearPago(
      visa,
      e.pagoBase({ descripcion: '  Pago de diciembre  ' }),
    );
    const larga = await e.crearPago(
      visa,
      e.pagoBase({ descripcion: 'x'.repeat(200) }),
    );

    expect(porDefecto.status).toBe(201);
    expect(porDefecto.body.descripcion).toBe('Pago de tarjeta');
    expect(recortada.status).toBe(201);
    expect(recortada.body.descripcion).toBe('Pago de diciembre');
    expect(larga.status).toBe(201);
    expect(larga.body.descripcion).toBe('x'.repeat(200));
    expect(pagosGuardados(e).map((doc) => doc.descripcion)).toEqual([
      'Pago de tarjeta',
      'Pago de diciembre',
      'x'.repeat(200),
    ]);
  });

  it.each([
    ['vacía', ''],
    ['solo espacios', '   '],
    ['de 201 caracteres', 'x'.repeat(201)],
    ['un número', 123],
    ['null', null],
  ])(
    'CA-RF32-18 una descripción %s responde 400 y no guarda nada',
    async (_caso, descripcion) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearPago(
        visa,
        e.pagoBase({ descripcion }),
      );

      expect(status).toBe(400);
      expect(mensajeDeCampo(body, 'descripcion')).toBe(true);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );

  it.each([
    ['tipo', 'INGRESO'],
    ['monto', 1],
    ['clasificacionFlujo', 'ORDINARIO'],
    ['tarjetaId', '665f1c2e9b1d4a0012ab34ee'],
    ['usuarioId', OTRO_USUARIO_ID],
    ['categoriaId', '665f1c2e9b1d4a0012ab34ce'],
    ['deudaId', '665f1c2e9b1d4a0012ab34cf'],
    ['comparacion', {}],
    ['foo', 'x'],
  ])(
    'CA-RF32-19 el campo no declarado %s responde 400 y no guarda nada',
    async (campo, valor) => {
      const visa = await e.sembrarTarjeta();

      const { status, body } = await e.crearPago(visa, {
        ...e.pagoBase(),
        [campo]: valor,
      });

      expect(status).toBe(400);
      expect(mensajeMencionaCampo(body, campo)).toBe(true);
      expect(e.transacciones.docs).toHaveLength(0);
    },
  );

  it('CA-RF32-19 un cuerpo vacío responde 400 por el valor y no guarda nada', async () => {
    const visa = await e.sembrarTarjeta();

    const { status, body } = await e.crearPago(visa, {});

    expect(status).toBe(400);
    expect(mensajeDeCampo(body, 'valor')).toBe(true);
    expect(e.transacciones.docs).toHaveLength(0);
  });
});
