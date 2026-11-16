import { describe, expect, it } from 'vitest';
import { utcALocal, localAUtc } from '../common/fechas.util.js';
import { generarGrilla, horasLibres, seSolapan, validarBloques, type ReglaSemanal } from './agenda.util.js';

const lunes = '2026-11-16';
const regla = (extra: Partial<ReglaSemanal> = {}): ReglaSemanal => ({ diaSemana: 1, horaInicio: '09:00', horaFin: '12:00', vigenteDesde: '2026-01-01', vigenteHasta: null, ...extra });
const hora = (d: Date) => utcALocal(d).hora;

describe('grilla de horas de atención', () => {
  it('corta el bloque según la duración de la cita', () => {
    const g = generarGrilla(lunes, [regla()], 30);
    expect(g.map((h) => hora(h.inicio))).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
    expect(hora(g[5].fin)).toBe('12:00');
  });
  it('no genera una cita que no cabe completa en el bloque', () => {
    expect(generarGrilla(lunes, [regla({ horaFin: '10:20' })], 30)).toHaveLength(2);
  });
  it('solo aplica el día de la semana de la regla', () => {
    expect(generarGrilla('2026-11-17', [regla()], 30)).toEqual([]);
  });
  it('respeta la vigencia de la regla', () => {
    expect(generarGrilla(lunes, [regla({ vigenteDesde: '2026-11-23' })], 30)).toEqual([]);
    expect(generarGrilla(lunes, [regla({ vigenteHasta: '2026-11-15' })], 30)).toEqual([]);
    expect(generarGrilla(lunes, [regla({ vigenteHasta: '2026-11-16' })], 30)).toHaveLength(6);
  });
  it('une varios bloques del mismo día en orden', () => {
    const g = generarGrilla(lunes, [regla({ horaInicio: '14:00', horaFin: '15:00' }), regla({ horaInicio: '09:00', horaFin: '10:00' })], 30);
    expect(g.map((h) => hora(h.inicio))).toEqual(['09:00', '09:30', '14:00', '14:30']);
  });
});

describe('horas libres', () => {
  const grilla = generarGrilla(lunes, [regla()], 30);
  const base = { bloqueos: [], citas: [], feriado: false, ahora: new Date('2026-11-01T00:00:00Z') };

  it('sin restricciones todas están libres', () => expect(horasLibres(grilla, base)).toHaveLength(6));
  it('descuenta las citas activas', () => {
    const libres = horasLibres(grilla, { ...base, citas: [{ inicio: grilla[1].inicio, fin: grilla[1].fin }] });
    expect(libres).toHaveLength(5);
    expect(libres.map((h) => hora(h.inicio))).not.toContain('09:30');
  });
  it('descuenta un bloqueo parcial del día', () => {
    const libres = horasLibres(grilla, { ...base, bloqueos: [{ inicio: localAUtc(lunes, '10:00'), fin: localAUtc(lunes, '11:00') }] });
    expect(libres.map((h) => hora(h.inicio))).toEqual(['09:00', '09:30', '11:00', '11:30']);
  });
  it('un feriado no deja ninguna hora', () => expect(horasLibres(grilla, { ...base, feriado: true })).toEqual([]));
  it('no ofrece horas pasadas', () => {
    const libres = horasLibres(grilla, { ...base, ahora: localAUtc(lunes, '10:15') });
    expect(libres.map((h) => hora(h.inicio))).toEqual(['10:30', '11:00', '11:30']);
  });
  it('aplica la antelación mínima y máxima de los pacientes', () => {
    const libres = horasLibres(grilla, { ...base, ahora: localAUtc(lunes, '08:00'), minimo: localAUtc(lunes, '10:00'), maximo: localAUtc(lunes, '11:00') });
    expect(libres.map((h) => hora(h.inicio))).toEqual(['10:00', '10:30', '11:00']);
  });
  it('una cita de otra duración que solapa una hora la ocupa', () => {
    const libres = horasLibres(grilla, { ...base, citas: [{ inicio: localAUtc(lunes, '09:15'), fin: localAUtc(lunes, '09:45') }] });
    expect(libres.map((h) => hora(h.inicio))).not.toContain('09:00');
    expect(libres.map((h) => hora(h.inicio))).not.toContain('09:30');
  });
});

describe('solapes y validación de bloques', () => {
  it('dos intervalos contiguos no se solapan', () => {
    const a = { inicio: localAUtc(lunes, '09:00'), fin: localAUtc(lunes, '09:30') };
    const b = { inicio: localAUtc(lunes, '09:30'), fin: localAUtc(lunes, '10:00') };
    expect(seSolapan(a, b)).toBe(false);
    expect(seSolapan(a, { inicio: localAUtc(lunes, '09:29'), fin: localAUtc(lunes, '10:00') })).toBe(true);
  });
  it('acepta bloques válidos', () => expect(validarBloques([{ diaSemana: 1, horaInicio: '09:00', horaFin: '12:00' }, { diaSemana: 1, horaInicio: '14:00', horaFin: '17:00' }])).toBeNull());
  it('rechaza un bloque con el término antes del inicio', () => expect(validarBloques([{ diaSemana: 1, horaInicio: '12:00', horaFin: '09:00' }])).toMatch(/posterior/));
  it('rechaza bloques solapados el mismo día pero no en días distintos', () => {
    expect(validarBloques([{ diaSemana: 1, horaInicio: '09:00', horaFin: '12:00' }, { diaSemana: 1, horaInicio: '11:00', horaFin: '13:00' }])).toMatch(/solapan/);
    expect(validarBloques([{ diaSemana: 1, horaInicio: '09:00', horaFin: '12:00' }, { diaSemana: 2, horaInicio: '11:00', horaFin: '13:00' }])).toBeNull();
  });
});
