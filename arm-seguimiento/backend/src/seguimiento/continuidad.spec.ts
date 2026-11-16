import { describe, expect, it } from 'vitest';
import { clasificarContinuidad, type SenalesContinuidad } from './continuidad.js';

const ahora = new Date('2026-12-01T12:00:00Z');
const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000);
const umbrales = { riesgoDias: 3, desercionDias: 30 };
const base: SenalesContinuidad = {
  ahora,
  tieneCitaFutura: false,
  ultimaAtendida: null,
  ultimaInasistencia: null,
  ultimaReserva: null,
  ultimaToma: null,
  primeraTomaVencida: null,
  ultimaLectura: null,
  sinLeerDesde: null,
  ultimoContactoMedico: hace(2),
  tratamientosVigentes: 0,
  tratamientosConPauta: 0,
};
const estado = (s: Partial<SenalesContinuidad>) => clasificarContinuidad({ ...base, ...s }, umbrales).estado;

describe('estado de continuidad del paciente', () => {
  it('con una cita futura y sin señales de riesgo está al día', () => expect(estado({ tieneCitaFutura: true, ultimaAtendida: hace(10) })).toBe('AL_DIA'));
  it('con un tratamiento vigente y registro reciente está al día', () =>
    expect(estado({ tratamientosVigentes: 1, tratamientosConPauta: 1, ultimaToma: hace(1) })).toBe('AL_DIA'));
  it('un tratamiento con pauta sin registro hace 3 días o más está en riesgo', () =>
    expect(estado({ tratamientosVigentes: 1, tratamientosConPauta: 1, ultimaToma: hace(4), tieneCitaFutura: true })).toBe('EN_RIESGO'));
  it('un tratamiento sin ninguna toma marcada desde que empezó está en riesgo', () =>
    expect(estado({ tratamientosVigentes: 1, tratamientosConPauta: 1, primeraTomaVencida: hace(5) })).toBe('EN_RIESGO'));
  it('un tratamiento que recién empieza (sin tomas vencidas) no está en riesgo', () =>
    expect(estado({ tratamientosVigentes: 1, tratamientosConPauta: 1, tieneCitaFutura: true })).toBe('AL_DIA'));
  it('indicaciones sin leer por 3 días o más: en riesgo', () => expect(estado({ sinLeerDesde: hace(3), tratamientosVigentes: 1 })).toBe('EN_RIESGO'));
  it('indicaciones sin leer hace 1 día: no es riesgo', () => expect(estado({ sinLeerDesde: hace(1), tratamientosVigentes: 1 })).toBe('AL_DIA'));
  it('una inasistencia sin cita nueva está en riesgo', () => expect(estado({ ultimaInasistencia: hace(2), ultimaAtendida: hace(20), ultimaReserva: hace(25) })).toBe('EN_RIESGO'));
  it('una inasistencia con una cita nueva no es riesgo', () => expect(estado({ ultimaInasistencia: hace(2), tieneCitaFutura: true })).toBe('AL_DIA'));
  it('sin cita futura, sin actividad por 30 días y con tratamiento vigente es desertor', () =>
    expect(estado({ tratamientosVigentes: 1, ultimaAtendida: hace(45), ultimaToma: hace(35) })).toBe('DESERTOR'));
  it('sin actividad por 30 días y con un control pendiente (atención reciente) es desertor', () => expect(estado({ ultimaAtendida: hace(60) })).toBe('DESERTOR'));
  it('con una cita futura nunca es desertor', () => expect(estado({ tratamientosVigentes: 1, ultimaAtendida: hace(90), tieneCitaFutura: true })).not.toBe('DESERTOR'));
  it('sin tratamientos ni controles pendientes está cerrado', () => expect(estado({ ultimaAtendida: hace(10) })).toBe('CERRADO'));
  it('una atención de hace más de 180 días y nada más está cerrado', () => expect(estado({ ultimaAtendida: hace(300) })).toBe('CERRADO'));
  it('entrega el motivo en palabras y los días sin actividad', () => {
    const r = clasificarContinuidad({ ...base, tratamientosVigentes: 1, ultimaAtendida: hace(45) }, umbrales);
    expect(r.motivo).toMatch(/45 días/);
    expect(r.diasSinActividad).toBe(45);
  });
  it('respeta umbrales distintos', () => {
    const s = { ...base, tratamientosVigentes: 1, tratamientosConPauta: 1, ultimaToma: hace(4), tieneCitaFutura: true };
    expect(clasificarContinuidad(s, { riesgoDias: 7, desercionDias: 30 }).estado).toBe('AL_DIA');
    expect(clasificarContinuidad(s, { riesgoDias: 3, desercionDias: 30 }).estado).toBe('EN_RIESGO');
  });
});
