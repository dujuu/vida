import { describe, expect, it } from 'vitest';
import { utcALocal } from '../common/fechas.util.js';
import { ModoPauta } from '../recomendaciones/modo-pauta.enum.js';
import { generarEventos, validarPauta, type EntradaPauta } from './generador.js';

const cada8 = (extra: Partial<EntradaPauta> = {}): EntradaPauta => ({ modo: ModoPauta.CADA_N_HORAS, intervaloHoras: 8, inicioLocal: '2026-11-20 08:00', duracionDias: 8, ...extra });

describe('generador de eventos del calendario', () => {
  it('ocho días cada 8 horas producen exactamente 24 tomas', () => {
    expect(generarEventos(cada8())).toHaveLength(24);
  });

  it('la primera toma es la hora de inicio y las siguientes suman el intervalo', () => {
    const t = generarEventos(cada8());
    expect(utcALocal(t[0])).toMatchObject({ fecha: '2026-11-20', hora: '08:00' });
    expect(utcALocal(t[1]).hora).toBe('16:00');
    expect(utcALocal(t[2])).toMatchObject({ fecha: '2026-11-21', hora: '00:00' });
    expect(t[1].getTime() - t[0].getTime()).toBe(8 * 3_600_000);
  });

  it('una toma al día durante 3 días da 3 tomas', () => {
    expect(generarEventos({ modo: ModoPauta.CADA_N_HORAS, intervaloHoras: 24, inicioLocal: '2026-11-20 09:00', duracionDias: 3 })).toHaveLength(3);
  });

  it('a horas fijas repite las horas locales cada día', () => {
    const t = generarEventos({ modo: ModoPauta.HORAS_FIJAS, horasLocales: ['20:00', '08:00'], inicioLocal: '2026-11-20 08:00', duracionDias: 5 });
    expect(t).toHaveLength(10);
    expect(t.map((x) => utcALocal(x).hora).slice(0, 4)).toEqual(['08:00', '20:00', '08:00', '20:00']);
  });

  it('a horas fijas, una cambio de hora oficial no mueve las horas de pared', () => {
    // En Chile el horario de verano comienza el domingo 6 de septiembre de 2026.
    const t = generarEventos({ modo: ModoPauta.HORAS_FIJAS, horasLocales: ['09:00'], inicioLocal: '2026-09-03 09:00', duracionDias: 7 });
    expect(t).toHaveLength(7);
    for (const x of t) expect(utcALocal(x).hora).toBe('09:00');
    // Pero la diferencia en UTC sí cambia un día: antes 4 horas, después 3.
    expect(t[3].getTime() - t[2].getTime()).toBe(23 * 3_600_000);
  });

  it('respeta los días de la semana', () => {
    const t = generarEventos({ modo: ModoPauta.HORAS_FIJAS, horasLocales: ['10:00'], inicioLocal: '2026-11-16 10:00', duracionDias: 14, diasSemana: [1, 3, 5] });
    expect(t).toHaveLength(6);
    expect(t.map((x) => utcALocal(x).diaSemana)).toEqual([1, 3, 5, 1, 3, 5]);
  });

  it('"según necesidad" no genera tomas', () => {
    expect(generarEventos({ modo: ModoPauta.SEGUN_NECESIDAD, inicioLocal: '2026-11-20 08:00', duracionDias: 5 })).toEqual([]);
  });

  it('no genera tomas anteriores a "desde" (versiones nuevas desde el cambio)', () => {
    const desde = new Date(generarEventos(cada8())[10].getTime() - 1);
    expect(generarEventos(cada8(), { desde })).toHaveLength(14);
  });

  it('respeta el horizonte "hasta" para tratamientos largos', () => {
    const t = generarEventos(cada8({ duracionDias: 200 }), { hasta: new Date(Date.parse('2026-11-30T00:00:00Z')) });
    expect(t.length).toBeLessThan(40);
    expect(t.every((x) => x.getTime() <= Date.parse('2026-11-30T00:00:00Z'))).toBe(true);
  });

  it('no repite instantes y los entrega ordenados', () => {
    const t = generarEventos({ modo: ModoPauta.HORAS_FIJAS, horasLocales: ['08:00', '20:00'], inicioLocal: '2026-11-20 08:00', duracionDias: 3 });
    const ms = t.map((x) => x.getTime());
    expect(ms).toEqual([...new Set(ms)].sort((a, b) => a - b));
  });
});

describe('validación de pautas', () => {
  it('acepta una pauta correcta', () => expect(validarPauta(cada8())).toBeNull());
  it('exige un intervalo entre 1 y 72 horas', () => {
    expect(validarPauta(cada8({ intervaloHoras: 0 }))).toMatch(/intervalo/);
    expect(validarPauta(cada8({ intervaloHoras: 100 }))).toMatch(/intervalo/);
    expect(validarPauta(cada8({ intervaloHoras: null }))).toMatch(/intervalo/);
  });
  it('exige una duración entre 1 y 365 días', () => {
    expect(validarPauta(cada8({ duracionDias: 0 }))).toMatch(/duración/);
    expect(validarPauta(cada8({ duracionDias: 400 }))).toMatch(/duración/);
  });
  it('rechaza una fecha de inicio que no existe', () => expect(validarPauta(cada8({ inicioLocal: '2026-02-30 08:00' }))).toMatch(/no existe/));
  it('rechaza un formato de inicio inválido', () => expect(validarPauta(cada8({ inicioLocal: '20/11/2026' }))).toMatch(/fecha y hora/));
  it('a horas fijas exige horas válidas y sin repetir', () => {
    const fijas = (horas: string[]): EntradaPauta => ({ modo: ModoPauta.HORAS_FIJAS, horasLocales: horas, inicioLocal: '2026-11-20 08:00', duracionDias: 3 });
    expect(validarPauta(fijas([]))).toMatch(/horas/);
    expect(validarPauta(fijas(['25:00']))).toMatch(/formato/);
    expect(validarPauta(fijas(['08:00', '08:00']))).toMatch(/repetidas/);
    expect(validarPauta(fijas(['08:00', '20:00']))).toBeNull();
  });
  it('rechaza una pauta que genera demasiadas tomas', () => {
    expect(validarPauta(cada8({ intervaloHoras: 1, duracionDias: 365 }))).toMatch(/demasiadas/);
  });
  it('rechaza días de la semana fuera de rango', () => expect(validarPauta(cada8({ diasSemana: [0, 8] }))).toMatch(/días de la semana/));
});
