/** Modo en que se reparten las tomas de un tratamiento. */
export enum ModoPauta {
  /** Cada N horas desde la primera toma. */
  CADA_N_HORAS = 'CADA_N_HORAS',
  /** A horas fijas del día (hora local del centro). */
  HORAS_FIJAS = 'HORAS_FIJAS',
  /** Solo si hace falta: no genera tomas ni recordatorios. */
  SEGUN_NECESIDAD = 'SEGUN_NECESIDAD',
}
