import mongoose from 'mongoose';
import { TipoTransaccion } from '../transacciones/transaccion.enums.js';
import { CategoriaSchema } from './categoria.schema.js';
import { CATEGORIAS_GENERALES_INICIALES } from './categorias-generales.js';
import { CategoriasSemilla } from './categorias-semilla.service.js';

describe('Categorías generales iniciales', () => {
  const CategoriaModelo = mongoose.model('CategoriaSemillaSoloParaPruebas', CategoriaSchema);

  it('son las que muestra el mockup: cinco de egreso y "Otros ingresos"', () => {
    expect(CATEGORIAS_GENERALES_INICIALES.map((c) => `${c.tipo}:${c.nombre}`).sort()).toEqual([
      'EGRESO:Alimentación',
      'EGRESO:Hogar',
      'EGRESO:Otros egresos',
      'EGRESO:Salud',
      'EGRESO:Transporte',
      'INGRESO:Otros ingresos',
    ]);
  });

  it('hay exactamente una categoría de respaldo por tipo, para reasignar los movimientos al eliminar una categoría', () => {
    for (const tipo of Object.values(TipoTransaccion)) {
      const respaldos = CATEGORIAS_GENERALES_INICIALES.filter((c) => c.tipo === tipo && c.esRespaldo);

      expect(respaldos, `tipo ${tipo}`).toHaveLength(1);
    }
  });

  it('ningún nombre se repite dentro de un mismo tipo, sin distinguir mayúsculas', () => {
    const claves = CATEGORIAS_GENERALES_INICIALES.map((c) => `${c.tipo}:${c.nombre.toLocaleLowerCase('es')}`);

    expect(new Set(claves).size).toBe(claves.length);
  });

  it('todas son válidas según el esquema', () => {
    for (const categoria of CATEGORIAS_GENERALES_INICIALES) {
      expect(new CategoriaModelo(categoria).validateSync(), categoria.nombre).toBeUndefined();
    }
  });
});

describe('CategoriasSemilla', () => {
  const crearEscenario = (generalesExistentes: number) => {
    const insertMany = vi.fn(async () => []);
    const countDocuments = vi.fn(async () => generalesExistentes);
    const semilla = new CategoriasSemilla({ countDocuments, insertMany } as never);
    return { semilla, insertMany, countDocuments };
  };

  it('siembra las generales cuando la base no tiene ninguna', async () => {
    const { semilla, insertMany, countDocuments } = crearEscenario(0);

    await semilla.onApplicationBootstrap();

    expect(countDocuments).toHaveBeenCalledWith({ esPredeterminada: true });
    expect(insertMany).toHaveBeenCalledTimes(1);
    const sembradas = (insertMany.mock.calls[0] as unknown as Array<Array<Record<string, unknown>>>)[0];
    expect(sembradas).toHaveLength(CATEGORIAS_GENERALES_INICIALES.length);
  });

  it('las categorías sembradas son generales del sistema: sin dueño y predeterminadas', async () => {
    const { semilla, insertMany } = crearEscenario(0);

    await semilla.onApplicationBootstrap();

    const sembradas = (insertMany.mock.calls[0] as unknown as Array<Array<Record<string, unknown>>>)[0];
    for (const categoria of sembradas) {
      expect(categoria.usuarioId).toBeNull();
      expect(categoria.esPredeterminada).toBe(true);
    }
    expect(sembradas.filter((c) => c.esRespaldo)).toHaveLength(2);
  });

  it('no siembra nada si ya existe alguna general, así repetir el arranque no duplica y no pisa lo que cambie el administrador', async () => {
    const { semilla, insertMany } = crearEscenario(1);

    await semilla.onApplicationBootstrap();

    expect(insertMany).not.toHaveBeenCalled();
  });
});
