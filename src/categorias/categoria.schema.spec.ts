import mongoose from 'mongoose';
import { TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { CategoriaSchema, NOMBRE_CATEGORIA_MAXIMO } from './categoria.schema.js';

// Criterio del 2.3.1: el esquema permite asociar categorías a transacciones de ingreso y de egreso.
describe('Esquema de Categoría', () => {
  const CategoriaModelo = mongoose.model('CategoriaSoloParaPruebas', CategoriaSchema);
  const camposConError = (datos: Record<string, unknown>) =>
    Object.keys(new CategoriaModelo(datos).validateSync()?.errors ?? {});

  it('guarda el dueño, el nombre, el tipo y las dos marcas de categoría general, y nada más', () => {
    const campos = Object.keys(CategoriaSchema.paths).filter(
      (campo) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(campo),
    );

    expect(campos.sort()).toEqual(['esPredeterminada', 'esRespaldo', 'nombre', 'tipo', 'usuarioId']);
  });

  it.each(Object.values(TipoTransaccion))('acepta una categoría de tipo %s', (tipo) => {
    expect(camposConError({ nombre: 'Mascotas', tipo })).toEqual([]);
  });

  it('rechaza un tipo que no sea INGRESO ni EGRESO', () => {
    expect(camposConError({ nombre: 'Mascotas', tipo: 'OTRO' })).toEqual(['tipo']);
  });

  describe('dueño (ADR-002)', () => {
    it('es opcional y vale null por defecto: así se representan las generales del sistema', () => {
      const general = new CategoriaModelo({ nombre: 'Salud', tipo: 'EGRESO' });

      expect(general.usuarioId).toBeNull();
      expect(general.validateSync()).toBeUndefined();
    });

    it('acepta el id de un usuario y rechaza un texto que no es un id', () => {
      const dueño = new mongoose.Types.ObjectId();

      expect(camposConError({ nombre: 'Mascotas', tipo: 'EGRESO', usuarioId: dueño })).toEqual([]);
      expect(camposConError({ nombre: 'Mascotas', tipo: 'EGRESO', usuarioId: 'no-es-un-id' })).toEqual(['usuarioId']);
    });
  });

  describe('nombre', () => {
    it.each(['nombre', 'tipo'])('%s es obligatorio', (campo) => {
      const datos: Record<string, unknown> = { nombre: 'Mascotas', tipo: 'EGRESO' };
      delete datos[campo];

      expect(camposConError(datos)).toContain(campo);
    });

    it('se recortan los espacios de los extremos', () => {
      expect(new CategoriaModelo({ nombre: '  Mascotas  ', tipo: 'EGRESO' }).nombre).toBe('Mascotas');
    });

    it.each(['', '   '])('rechaza un nombre vacío (%j)', (nombre) => {
      expect(camposConError({ nombre, tipo: 'EGRESO' })).toContain('nombre');
    });

    it(`acepta ${NOMBRE_CATEGORIA_MAXIMO} caracteres y rechaza uno más`, () => {
      expect(camposConError({ nombre: 'x'.repeat(NOMBRE_CATEGORIA_MAXIMO), tipo: 'EGRESO' })).toEqual([]);
      expect(camposConError({ nombre: 'x'.repeat(NOMBRE_CATEGORIA_MAXIMO + 1), tipo: 'EGRESO' })).toEqual(['nombre']);
    });
  });

  it('esPredeterminada y esRespaldo valen false por defecto: toda categoría nueva es personalizada', () => {
    const categoria = new CategoriaModelo({ nombre: 'Mascotas', tipo: 'EGRESO' });

    expect(categoria.esPredeterminada).toBe(false);
    expect(categoria.esRespaldo).toBe(false);
  });

  it('tiene un índice por usuario y tipo para listar las categorías disponibles', () => {
    expect(CategoriaSchema.indexes()).toContainEqual([{ usuarioId: 1, tipo: 1 }, expect.anything()]);
  });

  it('usa la colección categorias y registra las fechas de creación y modificación', () => {
    expect(CategoriaSchema.get('collection')).toBe('categorias');
    expect(CategoriaSchema.get('timestamps')).toBe(true);
  });
});
