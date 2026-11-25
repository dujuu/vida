import { describe, expect, it } from 'vitest';
import { fechaNacimientoValida } from '../pacientes/pacientes.service.js';
import { fechaMinimaNacimiento, REGEX_NOMBRE_PERSONA, REGEX_TELEFONO } from './validaciones.js';

describe('REGEX_TELEFONO', () => {
  it.each(['12345678', '+56 9 5555 0001', '(2) 2345-6789', '+56912345678', '123456789012'])('acepta %s', (t) => {
    expect(REGEX_TELEFONO.test(t)).toBe(true);
  });
  it.each(['1234567', '1234567890123', '+56 9 55', 'abc12345678', '12345678+', '++56912345678', '9 5555 0001 x', ''])('rechaza %s', (t) => {
    expect(REGEX_TELEFONO.test(t)).toBe(false);
  });
});

describe('REGEX_NOMBRE_PERSONA', () => {
  it.each(['Pérez', 'Muñoz', 'De la Cruz', 'Pérez-Cotapos', 'Ana María', 'Güell', ''])('acepta «%s»', (t) => {
    expect(REGEX_NOMBRE_PERSONA.test(t)).toBe(true);
  });
  it.each(['Pérez2', '3Pérez', "O'Higgins", 'Pérez.', 'Pérez_Soto', '@ana', 'Ana  María', ' Ana', 'Ana-', '-Ana', 'Ana😀'])('rechaza «%s»', (t) => {
    expect(REGEX_NOMBRE_PERSONA.test(t)).toBe(false);
  });
});

describe('fechaMinimaNacimiento', () => {
  it('resta 130 años', () => expect(fechaMinimaNacimiento('2026-11-24')).toBe('1896-11-24'));
  it('ajusta el 29 de febrero cuando el año límite no es bisiesto', () => expect(fechaMinimaNacimiento('2028-02-29')).toBe('1898-02-28'));
});

describe('fechaNacimientoValida', () => {
  const hoy = '2026-11-24';
  it('acepta hoy y una fecha normal', () => {
    expect(fechaNacimientoValida('2026-11-24', hoy)).toBe(true);
    expect(fechaNacimientoValida('1990-05-17', hoy)).toBe(true);
  });
  it('acepta exactamente 130 años', () => expect(fechaNacimientoValida('1896-11-24', hoy)).toBe(true));
  it('rechaza más de 130 años', () => expect(fechaNacimientoValida('1896-11-23', hoy)).toBe(false));
  it('rechaza fechas futuras, también de otro año', () => {
    expect(fechaNacimientoValida('2026-11-25', hoy)).toBe(false);
    expect(fechaNacimientoValida('2027-01-01', hoy)).toBe(false);
  });
  it('rechaza fechas que no existen', () => {
    expect(fechaNacimientoValida('2001-02-30', hoy)).toBe(false);
    expect(fechaNacimientoValida('abcd', hoy)).toBe(false);
  });
});
