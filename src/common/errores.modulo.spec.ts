import { AppModule } from '../app.module.js';
import { ErroresModule } from './errores.module.js';

describe('ErroresModule', () => {
  it('CA-ERR-10 AppModule importa ErroresModule', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(ErroresModule);
  });
});
