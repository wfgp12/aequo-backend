import {
  MENSAJES,
  OTRO_USUARIO_ID,
  USUARIO_ID,
  cerca,
  error404,
  instantanea,
  mensajeDeCampo,
  mensajeMencionaCampo,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.2.3 (RF-33): editar y eliminar compras con tarjeta.
describe('PATCH y DELETE /tarjetas/:tarjetaId/compras/:id (integración)', () => {
  const e = usarEntornoCompras();

  /** Una tarjeta «Visa» con la compra base registrada por la API. */
  const conCompra = async () => {
    const visa = await e.sembrarTarjeta({ nombre: 'Visa' });
    const creada = await e.crearCompra(visa, e.compraBase());
    return { visa, id: creada.body.id as string, creada: creada.body };
  };

  describe('editar', () => {
    it('CA-RF33-27 cambia la descripción de una compra y deja el resto igual', async () => {
      const { visa, id, creada } = await conCompra();

      const { status, body } = await e.editarCompra(visa, id, {
        descripcion: '  Televisor 55 pulgadas  ',
      });

      expect(status).toBe(200);
      expect(body).toEqual({
        ...creada,
        descripcion: 'Televisor 55 pulgadas',
        actualizadaEn: expect.any(String),
      });
      expect(body.actualizadaEn >= creada.actualizadaEn).toBe(true);
      expect(e.compras.docs[0].descripcion).toBe('Televisor 55 pulgadas');
    });

    it('CA-RF33-28 cambiar varios campos recalcula la cuota y el mes del último pago', async () => {
      const { visa, id } = await conCompra();
      const mascotas = await e.sembrarCategoria(
        'Mascotas',
        'EGRESO',
        USUARIO_ID,
      );

      const { status, body } = await e.editarCompra(visa, id, {
        valor: 500000,
        cuotas: 6,
        primerPago: '2027-01-20',
        fecha: '2026-11-28',
        categoriaId: mascotas.id,
        descripcion: 'Cama',
      });

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id,
        tarjetaId: visa,
        tipo: 'COMPRA',
        valor: 500000,
        cuotas: 6,
        primerPago: '2027-01',
        mesUltimoPago: '2027-06',
        fecha: '2026-11-28',
        categoriaId: mascotas.id,
        descripcion: 'Cama',
        tasaEAAplicada: 0.2921,
        cuotaUnicaSinInteres: false,
      });
      cerca(body.cuota, 89741.0851, 4);
      const guardada = e.compras.docs[0];
      expect(guardada.primerPago.toISOString()).toBe(
        '2027-01-01T00:00:00.000Z',
      );
      expect(guardada.tasaEAAplicada).toBe(0.2921);
      expect(guardada.cuotaUnicaSinInteres).toBe(false);
      expect(guardada.tipo).toBe('COMPRA');
      expect(String(guardada.tarjetaId)).toBe(visa);
    });

    const cuerposInvalidos: Array<[string, unknown]> = [
      ['{}', {}],
      ['descripcion null', { descripcion: null }],
      ['valor null', { valor: null }],
      ['cuotas null', { cuotas: null }],
      ['primerPago null', { primerPago: null }],
      ['fecha null', { fecha: null }],
      ['categoriaId null', { categoriaId: null }],
    ];

    it.each(cuerposInvalidos)(
      'CA-RF33-29 el cuerpo %s responde 400 y la compra no cambia',
      async (_nombre, cuerpo) => {
        const { visa, id } = await conCompra();
        const antes = instantanea(e.compras);

        const { status } = await e.editarCompra(visa, id, cuerpo);

        expect(status).toBe(400);
        expect(instantanea(e.compras)).toEqual(antes);
      },
    );

    const valoresInvalidos: Array<[string, unknown]> = [
      ['valor', 0],
      ['cuotas', 61],
      ['cuotas', 12.5],
      ['descripcion', 'x'.repeat(201)],
      ['descripcion', '   '],
      ['primerPago', 'pronto'],
      ['fecha', '2026-02-30'],
      ['categoriaId', 'no-es-un-id'],
    ];

    it.each(valoresInvalidos)(
      'CA-RF33-30 %s con el valor %j responde 400 y la compra no cambia',
      async (campo, valor) => {
        const { visa, id } = await conCompra();
        const antes = instantanea(e.compras);

        const { status, body } = await e.editarCompra(visa, id, {
          [campo]: valor,
        });

        expect(status).toBe(400);
        expect(mensajeDeCampo(body, campo)).toBe(true);
        expect(instantanea(e.compras)).toEqual(antes);
      },
    );

    const noEditables: Array<[string, unknown]> = [
      ['tarjetaId', '665f1c2e9b1d4a0012ab34ee'],
      ['tipo', 'AVANCE'],
      ['tasaEAAplicada', 0.5],
      ['cuotaUnicaSinInteres', true],
      ['usuarioId', OTRO_USUARIO_ID],
      ['id', '665f1c2e9b1d4a0012ab34ee'],
      ['cuota', 1],
      ['mesUltimoPago', '2030-01'],
      ['creadaEn', '2026-01-01T00:00:00.000Z'],
      ['otroCampo', 'x'],
    ];

    it.each(noEditables)(
      'CA-RF33-31 el campo %s (%j) no se edita: 400 y la compra no cambia',
      async (campo, valor) => {
        const { visa, id } = await conCompra();
        const antes = instantanea(e.compras);

        const { status, body } = await e.editarCompra(visa, id, {
          [campo]: valor,
        });

        expect(status).toBe(400);
        expect(mensajeMencionaCampo(body, campo)).toBe(true);
        expect(instantanea(e.compras)).toEqual(antes);
      },
    );

    it('CA-RF33-31 tampoco se puede mover la compra a otra tarjeta propia', async () => {
      const { visa, id } = await conCompra();
      const mastercard = await e.sembrarTarjeta({ nombre: 'Mastercard' });

      const { status, body } = await e.editarCompra(visa, id, {
        tarjetaId: mastercard,
      });

      expect(status).toBe(400);
      expect(mensajeMencionaCampo(body, 'tarjetaId')).toBe(true);
      expect(String(e.compras.docs[0].tarjetaId)).toBe(visa);
    });

    it('CA-RF33-32 la categoría al editar: ajena e inexistente 404, de ingreso 400, general de egresos válida', async () => {
      const { visa, id } = await conCompra();
      const deB = await e.sembrarCategoria(
        'Mascotas',
        'EGRESO',
        OTRO_USUARIO_ID,
      );
      const antes = instantanea(e.compras);

      const ajena = await e.editarCompra(visa, id, { categoriaId: deB.id });
      const noExiste = await e.editarCompra(visa, id, {
        categoriaId: '665f1c2e9b1d4a0012ab34ee',
      });
      const deIngreso = await e.editarCompra(visa, id, {
        categoriaId: e.salario.id,
      });

      for (const { status, body } of [ajena, noExiste]) {
        expect(status).toBe(404);
        expect(body).toEqual(error404(MENSAJES.categoriaNoEncontrada));
      }
      expect(deIngreso.status).toBe(400);
      expect(mensajeDeCampo(deIngreso.body, 'categoriaId')).toBe(true);
      expect(instantanea(e.compras)).toEqual(antes);

      const valida = await e.editarCompra(visa, id, {
        categoriaId: e.alimentacion.id,
      });

      expect(valida.status).toBe(200);
      expect(valida.body.categoriaId).toBe(e.alimentacion.id);
      expect(String(e.compras.docs[0].categoriaId)).toBe(e.alimentacion.id);
    });

    it('CA-RF33-33 editar una compra ajena, de otra tarjeta o inexistente da 404; una tarjeta ajena también; un id mal formado, 400', async () => {
      const { visa } = await conCompra();
      const mastercard = await e.sembrarTarjeta({ nombre: 'Mastercard' });
      const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
      const compraDeB = await e.sembrarCompra(deB, {}, OTRO_USUARIO_ID);
      const compraDeMastercard = await e.sembrarCompra(mastercard);
      const antes = instantanea(e.compras);
      const cuerpo = { valor: 1 };

      const respuestas = [
        await e.editarCompra(visa, compraDeB, cuerpo),
        await e.editarCompra(visa, compraDeMastercard, cuerpo),
        await e.editarCompra(visa, '665f1c2e9b1d4a0012ab34ee', cuerpo),
      ];
      const tarjetaAjena = await e.editarCompra(deB, compraDeB, cuerpo);
      const malFormado = await e.editarCompra(visa, 'no-es-un-id', cuerpo);

      for (const { status, body } of respuestas) {
        expect(status).toBe(404);
        expect(body).toEqual(error404(MENSAJES.compraNoEncontrada));
      }
      expect(tarjetaAjena.status).toBe(404);
      expect(tarjetaAjena.body).toEqual(error404(MENSAJES.tarjetaNoEncontrada));
      expect(malFormado.status).toBe(400);
      expect(instantanea(e.compras)).toEqual(antes);
    });

    it('CA-RF33-34 repetir la misma edición es inofensivo', async () => {
      const { visa, id } = await conCompra();

      const primera = await e.editarCompra(visa, id, { valor: 900000 });
      const segunda = await e.editarCompra(visa, id, { valor: 900000 });

      expect(primera.status).toBe(200);
      expect(segunda.status).toBe(200);
      expect(segunda.body.valor).toBe(900000);
      expect(segunda.body.cuota).toBe(primera.body.cuota);
      cerca(segunda.body.cuota, 85934.4225, 4);
      expect(e.compras.docs).toHaveLength(1);
    });
  });

  describe('eliminar', () => {
    it('CA-RF33-35 elimina la compra y no toca las demás compras ni las transacciones', async () => {
      const { visa, id } = await conCompra();
      const otra = (
        await e.crearCompra(visa, e.compraBase({ descripcion: 'Nevera' }))
      ).body.id;
      const mastercard = await e.sembrarTarjeta({ nombre: 'Mastercard' });
      const deMastercard = await e.sembrarCompra(mastercard);
      await e.sembrarTransaccion();

      const respuesta = await e.eliminarCompra(visa, id);

      expect(respuesta.status).toBe(204);
      expect(respuesta.text).toBe('');
      expect((await e.obtenerCompra(visa, id)).status).toBe(404);
      expect(e.compras.docs.map((doc) => String(doc._id)).sort()).toEqual(
        [otra, deMastercard].sort(),
      );
      expect(e.transacciones.docs).toHaveLength(1);
    });

    it('CA-RF33-36 eliminar de nuevo, o una compra ajena, de otra tarjeta o inexistente, da 404 y no borra nada; un id mal formado, 400', async () => {
      const { visa, id } = await conCompra();
      const mastercard = await e.sembrarTarjeta({ nombre: 'Mastercard' });
      const deB = await e.sembrarTarjeta({ nombre: 'Visa' }, OTRO_USUARIO_ID);
      const compraDeB = await e.sembrarCompra(deB, {}, OTRO_USUARIO_ID);
      const compraDeMastercard = await e.sembrarCompra(mastercard);
      await e.eliminarCompra(visa, id);
      const antes = instantanea(e.compras);

      const respuestas = [
        await e.eliminarCompra(visa, id),
        await e.eliminarCompra(visa, compraDeB),
        await e.eliminarCompra(visa, compraDeMastercard),
        await e.eliminarCompra(visa, '665f1c2e9b1d4a0012ab34ee'),
      ];
      const malFormado = await e.eliminarCompra(visa, 'no-es-un-id');

      for (const { status, body } of respuestas) {
        expect(status).toBe(404);
        expect(body).toEqual(error404(MENSAJES.compraNoEncontrada));
      }
      expect(malFormado.status).toBe(400);
      expect(instantanea(e.compras)).toEqual(antes);
      expect(e.compras.docs).toHaveLength(2);
    });
  });
});
