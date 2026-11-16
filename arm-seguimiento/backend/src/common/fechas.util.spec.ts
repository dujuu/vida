import { describe, expect, it } from 'vitest';
import { aMinutos, diaSemanaDe, localAUtc, sumarDias, sumarMinutos, utcALocal } from './fechas.util.js';

describe('fechas del centro', () => {
  it('en verano (UTC-3) las 12:00 locales son las 15:00 UTC', () => {
    expect(localAUtc('2026-11-20', '12:00').toISOString()).toBe('2026-11-20T15:00:00.000Z');
  });
  it('en invierno (UTC-4) las 12:00 locales son las 16:00 UTC', () => {
    expect(localAUtc('2026-07-01', '12:00').toISOString()).toBe('2026-07-01T16:00:00.000Z');
  });
  it('ida y vuelta entre hora local y UTC', () => {
    for (const [f, h] of [['2026-11-20', '08:30'], ['2026-07-15', '23:45'], ['2026-09-06', '12:00'], ['2026-04-05', '10:00']]) {
      expect(utcALocal(localAUtc(f, h))).toMatchObject({ fecha: f, hora: h });
    }
  });
  it('una hora que cruza la medianoche UTC conserva el día local', () => {
    expect(utcALocal(new Date('2026-11-21T02:30:00Z'))).toMatchObject({ fecha: '2026-11-20', hora: '23:30' });
  });
  it('calcula el día de la semana (1 lunes ... 7 domingo)', () => {
    expect(diaSemanaDe('2026-11-16')).toBe(1);
    expect(diaSemanaDe('2026-11-22')).toBe(7);
  });
  it('suma días cruzando el fin de mes y de año', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('suma minutos a una hora y convierte a minutos', () => {
    expect(sumarMinutos('09:30', 45)).toBe('10:15');
    expect(aMinutos('02:05')).toBe(125);
  });
});
