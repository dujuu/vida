import { hoyLocal } from '../common/fechas.util.js';

/** Índice de masa corporal, calculado al mostrar (no se guarda). Devuelve `null` si falta el peso o la talla. */
export function calcularImc(pesoKg: number | null, tallaCm: number | null): number | null {
  if (!pesoKg || !tallaCm) return null;
  const m = tallaCm / 100;
  return Math.round((pesoKg / (m * m)) * 10) / 10;
}

/** Edad en años cumplidos a una fecha, a partir de `AAAA-MM-DD`. Devuelve `null` si no hay fecha de nacimiento. */
export function calcularEdad(fechaNacimiento: string | null, hoy: string = hoyLocal()): number | null {
  if (!fechaNacimiento) return null;
  const [a, m, d] = fechaNacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
