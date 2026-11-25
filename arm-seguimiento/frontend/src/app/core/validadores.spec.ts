import { FormControl } from '@angular/forms';
import { fechaNacimientoEnRango, nombrePersona, telefonoValido, textoMinimo } from './validadores';

describe('textoMinimo', () => {
  const valida = (valor: string | null, min = 3) => textoMinimo(min)(new FormControl(valor));

  it('acepta texto con el largo mínimo', () => expect(valida('abc')).toBeNull());
  it('rechaza texto más corto', () => expect(valida('ab')).not.toBeNull());
  it('un texto de solo espacios no cuenta', () => {
    expect(valida('     ')).not.toBeNull();
    expect(valida(' \t\n ')).not.toBeNull();
  });
  it('los espacios de los extremos no suman', () => expect(valida('  ab  ')).not.toBeNull());
  it('rechaza null', () => expect(valida(null)).not.toBeNull());
});

describe('telefonoValido', () => {
  const ctl = (v: string) => ({ value: v }) as never;
  it('acepta vacío y teléfonos de 8 a 12 dígitos', () => {
    for (const t of ['', '12345678', '+56 9 5555 0001', '123456789012']) expect(telefonoValido(ctl(t))).toBeNull();
  });
  it('rechaza menos de 8, más de 12 y letras', () => {
    for (const t of ['1234567', '1234567890123', 'abc12345678', '+56 9 55']) expect(telefonoValido(ctl(t))).not.toBeNull();
  });
});

describe('nombrePersona', () => {
  const ctl = (v: string) => ({ value: v }) as never;
  it('acepta letras con tildes, espacios y guion', () => {
    for (const t of ['Pérez', 'Muñoz', 'De la Cruz', 'Pérez-Cotapos', '']) expect(nombrePersona(ctl(t))).toBeNull();
  });
  it('rechaza números y signos', () => {
    for (const t of ['Pérez2', "O'Higgins", 'Pérez.', '@ana']) expect(nombrePersona(ctl(t))).not.toBeNull();
  });
});

describe('fechaNacimientoEnRango', () => {
  const v = fechaNacimientoEnRango(() => '2026-11-24');
  const ctl = (x: string) => ({ value: x }) as never;
  it('acepta hoy, una fecha normal y exactamente 130 años', () => {
    for (const f of ['2026-11-24', '1990-05-17', '1896-11-24', '']) expect(v(ctl(f))).toBeNull();
  });
  it('rechaza el futuro y más de 130 años', () => {
    for (const f of ['2026-11-25', '2027-01-01', '1896-11-23']) expect(v(ctl(f))).not.toBeNull();
  });
});
