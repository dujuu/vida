import { describe, expect, it } from 'vitest';
import { TAMANO_MAXIMO_DOCUMENTO, firmaCoincide, limpiarNombreArchivo } from './archivos.util.js';
import { calcularEdad, calcularImc } from './ficha.util.js';

describe('ficha: cálculos', () => {
  it('calcula el IMC con un decimal', () => expect(calcularImc(68.5, 162)).toBe(26.1));
  it('no calcula el IMC si falta un dato', () => {
    expect(calcularImc(null, 162)).toBeNull();
    expect(calcularImc(70, null)).toBeNull();
  });
  it('calcula la edad según el cumpleaños', () => {
    expect(calcularEdad('1985-04-12', '2026-04-11')).toBe(40);
    expect(calcularEdad('1985-04-12', '2026-04-12')).toBe(41);
    expect(calcularEdad(null)).toBeNull();
  });
});

describe('documentos adjuntos', () => {
  const pdf = Buffer.from('%PDF-1.7 contenido');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  it('acepta un contenido cuya firma coincide con su tipo', () => {
    expect(firmaCoincide(pdf, 'application/pdf')).toBe(true);
    expect(firmaCoincide(png, 'image/png')).toBe(true);
    expect(firmaCoincide(jpg, 'image/jpeg')).toBe(true);
  });
  it('rechaza un ejecutable disfrazado de PDF', () => expect(firmaCoincide(Buffer.from('MZ\x90\x00'), 'application/pdf')).toBe(false));
  it('rechaza un tipo no permitido', () => expect(firmaCoincide(pdf, 'text/html')).toBe(false));
  it('rechaza un contenido que no corresponde al tipo declarado', () => expect(firmaCoincide(png, 'application/pdf')).toBe(false));
  it('el límite es de 10 MB', () => expect(TAMANO_MAXIMO_DOCUMENTO).toBe(10 * 1024 * 1024));
  it('limpia nombres con rutas y caracteres de control', () => {
    expect(limpiarNombreArchivo('../../etc/passwd')).not.toMatch(/[\\/]/);
    expect(limpiarNombreArchivo('../../etc/passwd')).not.toMatch(/^\./);
    expect(limpiarNombreArchivo('informe\x00.pdf')).toBe('informe_.pdf');
    expect(limpiarNombreArchivo('')).toBe('documento');
    expect(limpiarNombreArchivo('a'.repeat(300))).toHaveLength(200);
  });
});
