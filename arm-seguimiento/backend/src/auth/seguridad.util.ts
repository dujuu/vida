import { createHash, randomBytes, randomInt } from 'node:crypto';

/** Alfabeto de los códigos de acceso: sin 0, O, 1, I ni L, para que no se confundan al dictarlos. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** SHA-256 en hexadecimal. Se usa para guardar tokens y códigos sin dejarlos en claro. */
export function sha256(datos: string | Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}

/** Token aleatorio de 256 bits en hexadecimal, para la renovación de sesión. */
export function tokenAleatorio(): string {
  return randomBytes(32).toString('hex');
}

/** Código de un solo uso de 8 caracteres con formato `ABCD-EFGH`. */
export function generarCodigo(): string {
  let c = '';
  for (let i = 0; i < 8; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Quita guiones y espacios y pasa a mayúsculas, para comparar un código escrito a mano. */
export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Valida una contraseña nueva.
 *
 * @param password Contraseña propuesta.
 * @param rut RUT normalizado del usuario, para impedir que la use como contraseña.
 * @returns Mensaje de error en español, o `null` si es válida.
 */
export function validarPassword(password: string, rut: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (password.length > 72) return 'La contraseña no puede superar los 72 caracteres';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'La contraseña debe tener letras y números';
  const cuerpo = rut.split('-')[0].replace(/\D/g, '');
  if (cuerpo.length >= 7 && password.replace(/\D/g, '').includes(cuerpo)) return 'La contraseña no puede contener su RUT';
  return null;
}

/** Nombre de la cookie con el token de renovación. */
export const COOKIE_RENOVACION = 'armrt';

/** Obtiene el valor de una cookie del encabezado `Cookie`. */
export function leerCookie(cabecera: string | undefined, nombre: string): string | null {
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}
