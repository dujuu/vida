/**
 * Utilidades de fecha y hora del centro.
 *
 * Todas las fechas se guardan en UTC. Los horarios de atención y de las tomas se escriben en hora local
 * del centro (por defecto America/Santiago), y este es el único archivo que convierte entre ambas.
 */

/** Zona horaria del centro. Se puede cambiar con la variable de entorno `ZONA_HORARIA`. */
export const ZONA_HORARIA = process.env.ZONA_HORARIA ?? 'America/Santiago';

/** Hora local descompuesta. */
export interface FechaLocal {
  /** Fecha en formato `AAAA-MM-DD`. */
  fecha: string;
  /** Hora en formato `HH:mm`. */
  hora: string;
  /** Día de la semana: 1 lunes ... 7 domingo. */
  diaSemana: number;
}

const formateador = (zona: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** Diferencia en milisegundos entre la hora local de `zona` y UTC en el instante `instante`. */
function desfase(instante: number, zona: string): number {
  const partes = Object.fromEntries(
    formateador(zona)
      .formatToParts(new Date(instante))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
  const comoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second);
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

/**
 * Convierte una fecha y hora locales del centro en el instante UTC correspondiente.
 *
 * @param fecha Fecha local `AAAA-MM-DD`.
 * @param hora Hora local `HH:mm`.
 * @param zona Zona horaria; por defecto la del centro.
 * @returns El instante en UTC.
 */
export function localAUtc(fecha: string, hora: string, zona: string = ZONA_HORARIA): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, h, min, 0);
  // Se prueba con el desfase de dos aproximaciones para resolver los cambios de hora.
  let instante = ingenuo - desfase(ingenuo, zona);
  instante = ingenuo - desfase(instante, zona);
  return new Date(instante);
}

/**
 * Descompone un instante UTC en fecha y hora locales del centro.
 *
 * @param instante Instante en UTC.
 * @param zona Zona horaria; por defecto la del centro.
 */
export function utcALocal(instante: Date, zona: string = ZONA_HORARIA): FechaLocal {
  const p = Object.fromEntries(
    formateador(zona)
      .formatToParts(instante)
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  const fecha = `${p.year}-${p.month}-${p.day}`;
  return { fecha, hora: `${p.hour}:${p.minute}`, diaSemana: diaSemanaDe(fecha) };
}

/** Día de la semana de una fecha `AAAA-MM-DD`: 1 lunes ... 7 domingo. */
export function diaSemanaDe(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dia === 0 ? 7 : dia;
}

/** Suma `n` días a una fecha `AAAA-MM-DD` y devuelve otra fecha en el mismo formato. */
export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Fecha de hoy en la zona del centro, en formato `AAAA-MM-DD`. */
export function hoyLocal(ahora: Date = new Date()): string {
  return utcALocal(ahora).fecha;
}

/** Instante UTC en que empieza el día local `fecha`. */
export function inicioDiaUtc(fecha: string): Date {
  return localAUtc(fecha, '00:00');
}

/** Suma minutos a una hora `HH:mm` y devuelve otra hora `HH:mm` (sin pasar de medianoche). */
export function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Convierte `HH:mm` en minutos desde la medianoche. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** Expresión regular de una fecha `AAAA-MM-DD`. */
export const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Expresión regular de una hora `HH:mm`. */
export const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
