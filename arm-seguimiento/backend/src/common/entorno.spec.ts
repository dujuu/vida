import { describe, expect, it } from 'vitest';
import { validarEntorno } from './entorno.js';

const valido = { DB_USER: 'u', DB_PASS: 'p', DB_NAME: 'n', JWT_SECRET: 'x'.repeat(40) };

describe('validación del entorno', () => {
  it('acepta una configuración completa y completa los valores por defecto', () => {
    const e = validarEntorno(valido);
    expect(e).toMatchObject({ DB_HOST: '127.0.0.1', DB_PORT: 3306, PORT: 3000, MODO: 'desarrollo', COOKIE_SECURE: false });
  });
  it('dice cuál variable falta', () => {
    expect(() => validarEntorno({ ...valido, DB_PASS: '' })).toThrow(/DB_PASS/);
    expect(() => validarEntorno({})).toThrow(/DB_USER[\s\S]*JWT_SECRET/);
  });
  it('rechaza un JWT_SECRET corto', () => expect(() => validarEntorno({ ...valido, JWT_SECRET: 'corto' })).toThrow(/32 caracteres/));
  it('rechaza puertos inválidos y modos desconocidos', () => {
    expect(() => validarEntorno({ ...valido, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => validarEntorno({ ...valido, MODO: 'otro' })).toThrow(/MODO/);
  });
  it('en producción el modo por defecto es piloto', () => expect(validarEntorno({ ...valido, NODE_ENV: 'production' }).MODO).toBe('piloto'));
});
