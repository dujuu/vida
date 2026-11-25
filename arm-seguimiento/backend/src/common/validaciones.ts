/**
 * Reglas de validación compartidas por los datos de personas (usuarios, pacientes y contactos).
 * El frontend usa las mismas expresiones en `frontend/src/app/core/validadores.ts`.
 */

/**
 * Teléfono: un `+` inicial opcional, dígitos, espacios, guiones y paréntesis, con entre 8 y 12 dígitos
 * en total (los separadores no cuentan). Por ejemplo `+56 9 5555 0001` tiene 11 dígitos.
 */
export const REGEX_TELEFONO = /^\+?(?=(?:[ ()-]*\d){8,12}[ ()-]*$)[0-9 ()-]+$/;

/**
 * Nombre o apellido de una persona: solo letras (con tildes, ñ y ü), separadas por un espacio o un guion.
 * Sin números ni signos, porque el Registro Civil no los acepta. Un texto vacío pasa esta regla; los
 * campos obligatorios lo rechazan con su largo mínimo.
 */
export const REGEX_NOMBRE_PERSONA = /^(?:\p{L}+(?:[ -]\p{L}+)*)?$/u;

/** Edad máxima aceptada al registrar una fecha de nacimiento, en años. */
export const EDAD_MAXIMA_ANIOS = 130;

/**
 * Fecha más antigua aceptada como nacimiento: la misma fecha de `hoy` pero `EDAD_MAXIMA_ANIOS` años antes.
 *
 * @param hoy Fecha de hoy en formato `AAAA-MM-DD`.
 * @returns La fecha límite en formato `AAAA-MM-DD`.
 */
export function fechaMinimaNacimiento(hoy: string): string {
  const [anio, mes, dia] = hoy.split('-');
  const limite = `${Number(anio) - EDAD_MAXIMA_ANIOS}-${mes}-${dia}`;
  // El 29 de febrero no existe en todos los años: se usa el 28.
  return limite.endsWith('-02-29') && !esBisiesto(Number(anio) - EDAD_MAXIMA_ANIOS) ? limite.replace('-29', '-28') : limite;
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}
