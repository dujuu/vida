import { diaSemanaDe, localAUtc, sumarDias, utcALocal, REGEX_FECHA, REGEX_HORA } from '../common/fechas.util.js';
import { ModoPauta } from '../recomendaciones/modo-pauta.enum.js';

/** Datos de una pauta tal como los escribe el médico. El sistema no agrega ningún valor por defecto. */
export interface EntradaPauta {
  modo: ModoPauta;
  /** Solo para `CADA_N_HORAS`: horas entre una toma y la siguiente. */
  intervaloHoras?: number | null;
  /** Solo para `HORAS_FIJAS`: horas locales del día (`HH:mm`). */
  horasLocales?: string[] | null;
  /** Fecha y hora local de la primera toma: `AAAA-MM-DD HH:mm`. */
  inicioLocal: string;
  /** Duración del tratamiento en días. */
  duracionDias: number;
  /** Días de la semana en que aplica (1 lunes ... 7 domingo). Nulo o vacío: todos. */
  diasSemana?: number[] | null;
}

/** Opciones de generación. */
export interface OpcionesGeneracion {
  /** No se generan tomas anteriores a este instante (por ejemplo, ahora). */
  desde?: Date;
  /** No se generan tomas posteriores a este instante (horizonte de generación). */
  hasta?: Date;
}

/** Máximo de tomas que una pauta puede generar; protege al sistema de una pauta absurda. */
export const MAX_EVENTOS_POR_PAUTA = 2000;

/**
 * Valida una pauta.
 *
 * @returns Mensaje de error en español, o `null` si es válida.
 */
export function validarPauta(p: EntradaPauta): string | null {
  if (!Object.values(ModoPauta).includes(p.modo)) return 'El modo de la pauta no es válido';
  const [fecha, hora] = (p.inicioLocal ?? '').split(' ');
  if (!REGEX_FECHA.test(fecha ?? '') || !REGEX_HORA.test(hora ?? '')) return 'El inicio debe tener fecha y hora (AAAA-MM-DD HH:mm)';
  if (new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha) return 'La fecha de inicio no existe';
  if (!Number.isInteger(p.duracionDias) || p.duracionDias < 1 || p.duracionDias > 365) return 'La duración debe ser de 1 a 365 días';
  if (p.diasSemana && p.diasSemana.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return 'Los días de la semana deben estar entre 1 y 7';
  if (p.modo === ModoPauta.CADA_N_HORAS) {
    if (!Number.isInteger(p.intervaloHoras) || (p.intervaloHoras as number) < 1 || (p.intervaloHoras as number) > 72) return 'El intervalo debe ser de 1 a 72 horas';
  }
  if (p.modo === ModoPauta.HORAS_FIJAS) {
    const horas = p.horasLocales ?? [];
    if (horas.length < 1 || horas.length > 12) return 'Indique de 1 a 12 horas';
    if (horas.some((h) => !REGEX_HORA.test(h))) return 'Las horas deben tener formato HH:mm';
    if (new Set(horas).size !== horas.length) return 'Hay horas repetidas';
  }
  if (p.modo !== ModoPauta.SEGUN_NECESIDAD && generarEventos(p).length > MAX_EVENTOS_POR_PAUTA) return 'La pauta genera demasiadas tomas; reduzca la frecuencia o la duración';
  return null;
}

/**
 * Genera los instantes (UTC) de las tomas de una pauta. Es una función pura: no consulta la base de datos ni el reloj.
 *
 * - `CADA_N_HORAS` parte de la primera toma y suma el intervalo hasta completar la duración. Ocho días cada
 *   8 horas producen 24 tomas.
 * - `HORAS_FIJAS` repite las horas locales cada día dentro de la ventana de la duración. Las horas se
 *   convierten a UTC con la zona del centro, de modo que un cambio de hora oficial no las mueve.
 * - `SEGUN_NECESIDAD` no genera nada: se muestra como indicación vigente.
 *
 * La ventana del tratamiento es `[inicio, inicio + duración días)`, medida en hora de pared.
 */
export function generarEventos(p: EntradaPauta, o: OpcionesGeneracion = {}): Date[] {
  if (p.modo === ModoPauta.SEGUN_NECESIDAD) return [];
  const [fechaInicio, horaInicio] = p.inicioLocal.split(' ');
  const primera = localAUtc(fechaInicio, horaInicio);
  const finVentana = localAUtc(sumarDias(fechaInicio, p.duracionDias), horaInicio);
  const dias = p.diasSemana && p.diasSemana.length > 0 ? new Set(p.diasSemana) : null;
  const salida: number[] = [];

  const agregar = (t: Date) => {
    if (t.getTime() < primera.getTime() || t.getTime() >= finVentana.getTime()) return;
    if (dias && !dias.has(diaSemanaDe(utcALocal(t).fecha))) return;
    if (o.desde && t.getTime() < o.desde.getTime()) return;
    if (o.hasta && t.getTime() > o.hasta.getTime()) return;
    salida.push(t.getTime());
  };

  if (p.modo === ModoPauta.CADA_N_HORAS) {
    const paso = (p.intervaloHoras as number) * 3_600_000;
    for (let t = primera.getTime(); t < finVentana.getTime() && salida.length <= MAX_EVENTOS_POR_PAUTA + 1; t += paso) agregar(new Date(t));
  } else {
    const horas = [...(p.horasLocales ?? [])].sort();
    for (let i = 0; i <= p.duracionDias; i++) {
      const fecha = sumarDias(fechaInicio, i);
      for (const h of horas) agregar(localAUtc(fecha, h));
    }
  }
  return [...new Set(salida)].sort((a, b) => a - b).map((t) => new Date(t));
}
