import { describe, expect, it } from 'vitest';
import { EstadoCita } from './citas.entities.js';
import { ESTADOS_ACTIVOS, transicionValida } from './citas.util.js';

describe('estados de una cita', () => {
  it('recorre el camino normal: reservada, en espera, en atención, atendida', () => {
    expect(transicionValida(EstadoCita.RESERVADA, EstadoCita.EN_ESPERA)).toBe(true);
    expect(transicionValida(EstadoCita.EN_ESPERA, EstadoCita.EN_ATENCION)).toBe(true);
    expect(transicionValida(EstadoCita.EN_ATENCION, EstadoCita.ATENDIDA)).toBe(true);
  });
  it('desde reservada se puede cancelar o marcar inasistencia', () => {
    expect(transicionValida(EstadoCita.RESERVADA, EstadoCita.CANCELADA)).toBe(true);
    expect(transicionValida(EstadoCita.RESERVADA, EstadoCita.NO_ASISTIO)).toBe(true);
  });
  it('el médico puede iniciar la atención directamente desde reservada', () => expect(transicionValida(EstadoCita.RESERVADA, EstadoCita.EN_ATENCION)).toBe(true));
  it('una cita en atención no se puede cancelar ni marcar inasistente', () => {
    expect(transicionValida(EstadoCita.EN_ATENCION, EstadoCita.CANCELADA)).toBe(false);
    expect(transicionValida(EstadoCita.EN_ATENCION, EstadoCita.NO_ASISTIO)).toBe(false);
  });
  it('los estados finales no tienen salida', () => {
    for (const final of [EstadoCita.ATENDIDA, EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO]) {
      for (const otro of Object.values(EstadoCita)) expect(transicionValida(final, otro)).toBe(false);
    }
  });
  it('no se puede retroceder', () => {
    expect(transicionValida(EstadoCita.EN_ESPERA, EstadoCita.RESERVADA)).toBe(false);
    expect(transicionValida(EstadoCita.ATENDIDA, EstadoCita.EN_ATENCION)).toBe(false);
  });
  it('ocupan la hora las citas reservadas, en espera y en atención', () => {
    expect(ESTADOS_ACTIVOS).toEqual([EstadoCita.RESERVADA, EstadoCita.EN_ESPERA, EstadoCita.EN_ATENCION]);
  });
});
