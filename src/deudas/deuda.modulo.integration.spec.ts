import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { Idempotencia } from '../idempotencia/idempotencia.schema.js';
import { Transaccion } from '../transacciones/transaccion.schema.js';
import { DeudasModule } from './deudas.module.js';

// Paquete 6.1.1 (RF-34): el módulo de deudas registra el modelo y la aplicación lo carga.
describe('DeudasModule', () => {
  it('CA-RF34-12 registra el modelo con el nombre Deuda', async () => {
    const deudasEnMemoria = { marca: 'deudas-en-memoria' };
    // Si el módulo no registra el modelo, reemplazar un proveedor inexistente no hace nada y `get` falla.
    const token = getModelToken('Deuda');
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }), DeudasModule],
    })
      .overrideProvider(token)
      .useValue(deudasEnMemoria)
      .overrideProvider(getModelToken(Transaccion.name))
      .useValue({})
      .overrideProvider(getModelToken(Idempotencia.name))
      .useValue({})
      .compile();

    expect(modulo.get(token, { strict: false })).toBe(deudasEnMemoria);

    await modulo.close();
  });

  // Sin esto el modelo no existe en la aplicación y eliminar la cuenta dejaría las deudas huérfanas (RF-04).
  it('CA-RF34-12 AppModule importa DeudasModule', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(DeudasModule);
  });
});
