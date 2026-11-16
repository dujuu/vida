import { describe, expect, it } from 'vitest';
import { generarCodigo, leerCookie, normalizarCodigo, sha256, tokenAleatorio, validarPassword } from './seguridad.util.js';

describe('seguridad', () => {
  it('sha256 es determinista y acepta bytes', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256(Buffer.from('abc'))).toBe(sha256('abc'));
  });
  it('el token de renovación tiene 256 bits y no se repite', () => {
    expect(tokenAleatorio()).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenAleatorio()).not.toBe(tokenAleatorio());
  });
  it('el código tiene formato ABCD-EFGH y evita caracteres confusos', () => {
    for (let i = 0; i < 200; i++) expect(generarCodigo()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });
  it('normaliza un código escrito a mano', () => expect(normalizarCodigo(' abcd-efgh ')).toBe('ABCDEFGH'));

  describe('contraseña', () => {
    const rut = '12345678-5';
    it('acepta una contraseña válida', () => expect(validarPassword('Vida2026', rut)).toBeNull());
    it('exige 8 caracteres', () => expect(validarPassword('Ab1', rut)).toMatch(/8 caracteres/));
    it('exige letras y números', () => {
      expect(validarPassword('solo letras', rut)).toMatch(/letras y números/);
      expect(validarPassword('1234567890', rut)).toMatch(/letras y números/);
    });
    it('no admite más de 72 caracteres (límite de bcrypt)', () => expect(validarPassword('a1'.repeat(40), rut)).toMatch(/72/));
    it('no puede contener el RUT', () => expect(validarPassword('rut12345678', rut)).toMatch(/RUT/));
  });

  describe('cookies', () => {
    it('lee una cookie entre varias', () => expect(leerCookie('a=1; armrt=12.abc; b=2', 'armrt')).toBe('12.abc'));
    it('devuelve nulo si no existe o no hay encabezado', () => {
      expect(leerCookie('a=1', 'armrt')).toBeNull();
      expect(leerCookie(undefined, 'armrt')).toBeNull();
    });
  });
});
