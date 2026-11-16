import { aMinutos, diaSemanaDe, localAUtc, sumarMinutos } from '../common/fechas.util.js';

/** Regla semanal de atención, con horas locales. */
export interface ReglaSemanal {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

/** Intervalo de tiempo en UTC. */
export interface Intervalo {
  inicio: Date;
  fin: Date;
}

/** Dos intervalos se solapan si cada uno empieza antes de que termine el otro. */
export function seSolapan(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fin.getTime() && b.inicio.getTime() < a.fin.getTime();
}

/**
 * Genera todas las horas de atención posibles de un día local, cortando cada bloque según la duración de cita.
 * La grilla es fija: las citas empiezan en múltiplos de la duración desde el inicio del bloque.
 *
 * @param fecha Fecha local `AAAA-MM-DD`.
 * @param reglas Reglas semanales del médico.
 * @param duracionMin Duración de cada cita, en minutos.
 * @returns Intervalos en UTC, ordenados por hora.
 */
export function generarGrilla(fecha: string, reglas: ReglaSemanal[], duracionMin: number): Intervalo[] {
  const dia = diaSemanaDe(fecha);
  const grilla: Intervalo[] = [];
  for (const r of reglas) {
    if (r.diaSemana !== dia || r.vigenteDesde > fecha || (r.vigenteHasta !== null && r.vigenteHasta < fecha)) continue;
    const fin = aMinutos(r.horaFin);
    for (let m = aMinutos(r.horaInicio); m + duracionMin <= fin; m += duracionMin) {
      const hIni = sumarMinutos('00:00', m);
      const hFin = sumarMinutos('00:00', m + duracionMin);
      grilla.push({ inicio: localAUtc(fecha, hIni), fin: localAUtc(fecha, hFin) });
    }
  }
  return grilla.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Condiciones que descuentan horas de la grilla. */
export interface RestriccionesAgenda {
  /** Excepciones del médico: vacaciones, permisos. */
  bloqueos: Intervalo[];
  /** Citas activas (no canceladas). */
  citas: Intervalo[];
  /** Si el día es feriado, no hay horas. */
  feriado: boolean;
  /** Instante actual: no se ofrecen horas pasadas. */
  ahora: Date;
  /** Antelación mínima exigida (solo pacientes). */
  minimo?: Date;
  /** Antelación máxima permitida (solo pacientes). */
  maximo?: Date;
}

/** Horas libres de un día: la grilla menos bloqueos, feriados, citas activas y horas pasadas o fuera de antelación. */
export function horasLibres(grilla: Intervalo[], r: RestriccionesAgenda): Intervalo[] {
  if (r.feriado) return [];
  return grilla.filter(
    (h) =>
      h.inicio.getTime() > r.ahora.getTime() &&
      (!r.minimo || h.inicio.getTime() >= r.minimo.getTime()) &&
      (!r.maximo || h.inicio.getTime() <= r.maximo.getTime()) &&
      !r.bloqueos.some((b) => seSolapan(h, b)) &&
      !r.citas.some((c) => seSolapan(h, c)),
  );
}

/** Valida un conjunto de bloques semanales: horas en orden y sin solapes dentro del mismo día. */
export function validarBloques(bloques: Array<{ diaSemana: number; horaInicio: string; horaFin: string }>): string | null {
  for (const b of bloques) {
    if (aMinutos(b.horaFin) <= aMinutos(b.horaInicio)) return 'La hora de término debe ser posterior a la de inicio';
  }
  for (let i = 0; i < bloques.length; i++) {
    for (let j = i + 1; j < bloques.length; j++) {
      const a = bloques[i];
      const b = bloques[j];
      if (a.diaSemana === b.diaSemana && aMinutos(a.horaInicio) < aMinutos(b.horaFin) && aMinutos(b.horaInicio) < aMinutos(a.horaFin)) {
        return 'Hay bloques que se solapan el mismo día';
      }
    }
  }
  return null;
}
