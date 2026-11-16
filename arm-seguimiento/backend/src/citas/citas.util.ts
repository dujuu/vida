import { EstadoCita } from './citas.entities.js';

/**
 * Transiciones permitidas de estado de una cita. No hay otros caminos:
 * RESERVADA → EN_ESPERA → EN_ATENCION → ATENDIDA; y desde RESERVADA también CANCELADA o NO_ASISTIO.
 * Un médico puede iniciar la atención directamente desde RESERVADA.
 */
const PERMITIDAS: Record<EstadoCita, EstadoCita[]> = {
  [EstadoCita.RESERVADA]: [EstadoCita.EN_ESPERA, EstadoCita.EN_ATENCION, EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO],
  [EstadoCita.EN_ESPERA]: [EstadoCita.EN_ATENCION, EstadoCita.NO_ASISTIO],
  [EstadoCita.EN_ATENCION]: [EstadoCita.ATENDIDA],
  [EstadoCita.ATENDIDA]: [],
  [EstadoCita.CANCELADA]: [],
  [EstadoCita.NO_ASISTIO]: [],
};

/** Verdadero si una cita puede pasar del estado `de` al estado `a`. */
export function transicionValida(de: EstadoCita, a: EstadoCita): boolean {
  return PERMITIDAS[de].includes(a);
}

/** Estados en que la cita ocupa la hora del médico y del paciente. */
export const ESTADOS_ACTIVOS = [EstadoCita.RESERVADA, EstadoCita.EN_ESPERA, EstadoCita.EN_ATENCION];
