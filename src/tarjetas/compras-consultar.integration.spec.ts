import {
  CLAVES_DE_UNA_COMPRA,
  MENSAJES,
  OTRO_USUARIO_ID,
  dia,
  error404,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.2.3 (RF-26, RF-33): listar y consultar las compras y avances de una tarjeta.
describe('GET /tarjetas/:tarjetaId/compras: listar y consultar (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF26-58 lista solo las compras de esa tarjeta y del usuario, la más reciente primero', async () => {
    const visa = await e.sembrarTarjeta({ nombre: 'Visa' });
    const mastercard = await e.sembrarTarjeta({ nombre: 'Mastercard' });
    const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    const primera = await e.sembrarCompra(visa, { fecha: dia('2026-11-10') });
    const ultima = await e.sembrarCompra(visa, { fecha: dia('2026-11-25') });
    const mismoDia = await e.sembrarCompra(visa, { fecha: dia('2026-11-10') });
    await e.sembrarCompra(mastercard);
    await e.sembrarCompra(deB, {}, OTRO_USUARIO_ID);
    const sinCompras = await e.sembrarTarjeta({ nombre: 'Amex' });

    const { status, body } = await e.listarCompras(visa);
    const vacia = await e.listarCompras(sinCompras);

    expect(status).toBe(200);
    expect(Object.keys(body)).toEqual(['items']);
    expect(body.items.map((c: { id: string }) => c.id)).toEqual([
      ultima,
      mismoDia,
      primera,
    ]);
    for (const compra of body.items) {
      expect(Object.keys(compra).sort()).toEqual(CLAVES_DE_UNA_COMPRA);
    }
    expect(vacia.status).toBe(200);
    expect(vacia.body).toEqual({ items: [] });
  });

  it('CA-RF26-59 el listado incluye compras y avances y se puede filtrar por tipo', async () => {
    const visa = await e.sembrarTarjeta();
    const compra = await e.sembrarCompra(visa);
    const avance = await e.sembrarCompra(visa, {
      tipo: 'AVANCE',
      descripcion: 'Avance en efectivo',
    });
    const ids = (respuesta: { body: { items: Array<{ id: string }> } }) =>
      respuesta.body.items.map((c) => c.id).sort();

    const todas = await e.listarCompras(visa);
    const soloCompras = await e.listarCompras(visa, 'tipo=COMPRA');
    const soloAvances = await e.listarCompras(visa, 'tipo=AVANCE');

    expect(ids(todas)).toEqual([compra, avance].sort());
    expect(ids(soloCompras)).toEqual([compra]);
    expect(soloCompras.body.items[0].tipo).toBe('COMPRA');
    expect(ids(soloAvances)).toEqual([avance]);
    expect(soloAvances.body.items[0].tipo).toBe('AVANCE');
  });

  it('CA-RF26-60 el filtro mes usa el mes de la fecha de la compra, con bordes de mes', async () => {
    const visa = await e.sembrarTarjeta();
    // El primer pago de la compra del 31 de octubre es noviembre: no debe entrar (el filtro es por la fecha de compra).
    await e.sembrarCompra(visa, {
      fecha: dia('2026-10-31'),
      primerPago: dia('2026-11-01'),
    });
    const inicioMes = await e.sembrarCompra(visa, { fecha: dia('2026-11-01') });
    const finMes = await e.sembrarCompra(visa, { fecha: dia('2026-11-30') });
    await e.sembrarCompra(visa, {
      fecha: dia('2026-12-01'),
      primerPago: dia('2026-11-01'),
    });
    const bisiesto = await e.sembrarCompra(visa, { fecha: dia('2028-02-29') });
    const ids = (respuesta: { body: { items: Array<{ id: string }> } }) =>
      respuesta.body.items.map((c) => c.id).sort();

    const noviembre = await e.listarCompras(visa, 'mes=2026-11');
    const febrero = await e.listarCompras(visa, 'mes=2028-02');

    expect(noviembre.status).toBe(200);
    expect(ids(noviembre)).toEqual([inicioMes, finMes].sort());
    expect(febrero.status).toBe(200);
    expect(ids(febrero)).toEqual([bisiesto]);
  });

  it.each([
    'tipo=PRESTAMO',
    'tipo=avance',
    'mes=2026-13',
    'mes=2026-11-01',
    'foo=1',
  ])('CA-RF26-61 el parámetro %s responde 400', async (consulta) => {
    const visa = await e.sembrarTarjeta();

    const { status, body } = await e.listarCompras(visa, consulta);

    expect(status).toBe(400);
    expect(mensajeMencionaCampo(body, consulta.split('=')[0])).toBe(true);
  });

  it('CA-RF26-62 listar las compras de una tarjeta ajena o inexistente da 404', async () => {
    const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    await e.sembrarCompra(deB, {}, OTRO_USUARIO_ID);

    const ajena = await e.listarCompras(deB);
    const noExiste = await e.listarCompras('665f1c2e9b1d4a0012ab34ee');

    for (const { status, body } of [ajena, noExiste]) {
      expect(status).toBe(404);
      expect(body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
    }
  });

  it('CA-RF26-63 consultar una compra propia devuelve la misma que respondió el POST', async () => {
    const visa = await e.sembrarTarjeta();
    const creada = await e.crearCompra(visa, e.compraBase());

    const { status, body } = await e.obtenerCompra(visa, creada.body.id);

    expect(status).toBe(200);
    expect(body).toEqual(creada.body);
    expect(body.mesUltimoPago).toBe('2027-11');
  });

  it('CA-RF26-64 una compra inexistente, ajena o en otra tarjeta da 404 con el mismo mensaje; un id mal formado, 400', async () => {
    const visa = await e.sembrarTarjeta({ nombre: 'Visa' });
    const mastercard = await e.sembrarTarjeta({ nombre: 'Mastercard' });
    const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
    const compraDeB = await e.sembrarCompra(deB, {}, OTRO_USUARIO_ID);
    const compraDeMastercard = await e.sembrarCompra(mastercard);

    const respuestas = [
      await e.obtenerCompra(visa, compraDeB),
      await e.obtenerCompra(visa, compraDeMastercard),
      await e.obtenerCompra(visa, '665f1c2e9b1d4a0012ab34ee'),
    ];
    const malFormado = await e.obtenerCompra(visa, 'no-es-un-id');

    for (const { status, body } of respuestas) {
      expect(status).toBe(404);
      expect(body).toEqual(error404(MENSAJES.compraNoEncontrada));
    }
    expect(malFormado.status).toBe(400);
    expect(mensajeDeCampo(malFormado.body, 'id')).toBe(true);
  });
});
