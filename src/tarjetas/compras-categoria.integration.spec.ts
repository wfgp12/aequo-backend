import {
  USUARIO_ID,
  usarEntornoCompras,
} from '../../test/tarjetas/arnes-compras.js';

// Paquete 5.2.3 (RF-26, RF-12): al eliminar una categoría personalizada, sus compras pasan a la categoría de respaldo.
describe('DELETE /categorias/:id: categorías usadas por compras (integración)', () => {
  const e = usarEntornoCompras();

  it('CA-RF26-65 eliminar una categoría usada por compras las reasigna a la de respaldo de egresos', async () => {
    const visa = await e.sembrarTarjeta();
    const mascotas = await e.sembrarCategoria('Mascotas', 'EGRESO', USUARIO_ID);
    const delHogar = await e.crearCompra(
      visa,
      e.compraBase({ descripcion: 'Nevera' }),
    );
    const deMascotas = await e.crearCompra(
      visa,
      e.compraBase({ descripcion: 'Cama', categoriaId: mascotas.id }),
    );

    const respuesta = await e.eliminarCategoria(mascotas.id);

    expect(respuesta.status).toBe(204);
    expect(e.categorias.docs.map((doc) => String(doc._id))).not.toContain(
      mascotas.id,
    );
    const reasignada = await e.obtenerCompra(visa, deMascotas.body.id);
    expect(reasignada.status).toBe(200);
    expect(reasignada.body.categoriaId).toBe(e.otrosEgresos.id);
    const intacta = await e.obtenerCompra(visa, delHogar.body.id);
    expect(intacta.body.categoriaId).toBe(e.hogar.id);
    expect(e.compras.docs).toHaveLength(2);
  });
});
