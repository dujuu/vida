import type { ValidatorFn } from '@angular/forms';

/** Exige un largo mínimo ignorando los espacios de los extremos (un texto de solo espacios no vale). */
export const textoMinimo =
  (min: number): ValidatorFn =>
  (control) =>
    String(control.value ?? '').trim().length >= min ? null : { textoMinimo: { min } };

/** Teléfono: `+` inicial opcional y de 8 a 12 dígitos en total. Igual que en el servidor. */
export const REGEX_TELEFONO = /^\+?(?=(?:[ ()-]*\d){8,12}[ ()-]*$)[0-9 ()-]+$/;

/** Nombre o apellido: solo letras separadas por un espacio o un guion. Igual que en el servidor. */
export const REGEX_NOMBRE_PERSONA = /^(?:\p{L}+(?:[ -]\p{L}+)*)?$/u;

/** Edad máxima aceptada para una fecha de nacimiento, en años. */
export const EDAD_MAXIMA_ANIOS = 130;

/** Teléfono opcional: vacío es válido; si se escribe, debe cumplir la regla. */
export const telefonoValido: ValidatorFn = (control) => {
  const v = String(control.value ?? '').trim();
  return v === '' || REGEX_TELEFONO.test(v) ? null : { telefono: true };
};

/** Nombre o apellido: sin números ni signos. */
export const nombrePersona: ValidatorFn = (control) => (REGEX_NOMBRE_PERSONA.test(String(control.value ?? '').trim()) ? null : { nombrePersona: true });

/** Fecha más antigua aceptada como nacimiento: `hoy` menos 130 años (`AAAA-MM-DD`). */
export function fechaMinimaNacimiento(hoy: string): string {
  const [anio, mes, dia] = hoy.split('-');
  const a = Number(anio) - EDAD_MAXIMA_ANIOS;
  const bisiesto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  return mes === '02' && dia === '29' && !bisiesto ? `${a}-02-28` : `${a}-${mes}-${dia}`;
}

/** Fecha de nacimiento: no futura y de no más de 130 años. Vacía es válida (la exigen otros validadores). */
export const fechaNacimientoEnRango =
  (hoy: () => string): ValidatorFn =>
  (control) => {
    const v = String(control.value ?? '');
    if (v === '') return null;
    return v >= fechaMinimaNacimiento(hoy()) && v <= hoy() ? null : { fechaNacimiento: true };
  };
