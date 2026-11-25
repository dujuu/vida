import { describe, expect, it } from 'vitest';
import { COMUNAS, REGIONES, comunaOficial, ubicacionDeComuna } from './divisiones-chile.js';

describe('divisiones de Chile', () => {
  it('tiene 16 regiones, 56 provincias y 346 comunas sin repetir', () => {
    expect(REGIONES).toHaveLength(16);
    expect(REGIONES.flatMap((r) => r.provincias)).toHaveLength(56);
    expect(COMUNAS).toHaveLength(346);
    expect(new Set(COMUNAS).size).toBe(346);
  });
  it('reconoce una comuna sin importar mayúsculas ni espacios', () => {
    expect(comunaOficial('  arica ')).toBe('Arica');
    expect(comunaOficial('ÑUÑOA')).toBe('Ñuñoa');
    expect(comunaOficial('Atlantis')).toBeNull();
  });
  it('ubica una comuna en su provincia y su región', () => {
    expect(ubicacionDeComuna('Arica')).toEqual({ region: 'Arica y Parinacota', provincia: 'Arica', comuna: 'Arica' });
    expect(ubicacionDeComuna('Putre')?.provincia).toBe('Parinacota');
  });
});
