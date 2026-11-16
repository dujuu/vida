/**
 * Utilidades de fecha del frontend. El servidor guarda todo en UTC; aquí se muestra en la hora del centro
 * (America/Santiago), sin importar la zona del teléfono o el computador.
 */

/** Zona horaria del centro. */
export const ZONA = 'America/Santiago';

const partes = (d: Date, opciones: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, hourCycle: 'h23', ...opciones }).formatToParts(d).map((p) => [p.type, p.value]));

/** Fecha local del centro en formato `AAAA-MM-DD`. */
export function fechaLocal(valor: string | Date): string {
  const p = partes(new Date(valor), { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p['year']}-${p['month']}-${p['day']}`;
}

/** Hora local del centro en formato `HH:mm`. */
export function horaLocal(valor: string | Date): string {
  const p = partes(new Date(valor), { hour: '2-digit', minute: '2-digit' });
  return `${p['hour']}:${p['minute']}`;
}

/** Fecha de hoy en el centro. */
export const hoyIso = (): string => fechaLocal(new Date());

/** Suma días a una fecha `AAAA-MM-DD`. */
export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Día de la semana de una fecha: 1 lunes ... 7 domingo. */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dia === 0 ? 7 : dia;
}

/** Lunes de la semana de una fecha. */
export const inicioSemana = (fecha: string): string => sumarDias(fecha, 1 - diaSemana(fecha));

/** Mes de una fecha: `AAAA-MM`. */
export const mesDe = (fecha: string): string => fecha.slice(0, 7);

/** Suma meses a un mes `AAAA-MM`. */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Último día de un mes `AAAA-MM`. */
export function ultimoDiaDelMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

const enFecha = (fecha: string) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
};

/** «viernes 20 de noviembre». */
export const fechaLarga = (fecha: string): string =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(enFecha(fecha));

/** «20 nov 2026». */
export const fechaCorta = (fecha: string): string =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(enFecha(fecha)).replace('.', '');

/** «noviembre de 2026». */
export const nombreMes = (mes: string): string =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(enFecha(`${mes}-01`));

/** «20 nov 2026, 08:00» a partir de un instante. */
export const fechaHora = (valor: string | Date): string => `${fechaCorta(fechaLocal(valor))}, ${horaLocal(valor)}`;

/** «hoy», «mañana», o la fecha larga, para un instante. */
export function diaRelativo(valor: string | Date): string {
  const f = fechaLocal(valor);
  const hoy = hoyIso();
  if (f === hoy) return 'Hoy';
  if (f === sumarDias(hoy, 1)) return 'Mañana';
  if (f === sumarDias(hoy, -1)) return 'Ayer';
  return fechaLarga(f);
}

/** Convierte una fecha `AAAA-MM-DD` y una hora `HH:mm` locales del centro en un instante UTC ISO. */
export function aInstanteUtc(fecha: string, hora: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, h, min);
  const desfase = (t: number) => {
    const p = partes(new Date(t), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']), Number(p['hour']), Number(p['minute']), Number(p['second'])) - Math.floor(t / 1000) * 1000;
  };
  let t = ingenuo - desfase(ingenuo);
  t = ingenuo - desfase(t);
  return new Date(t).toISOString();
}

/** Tiempo transcurrido en palabras: «hoy», «ayer», «hace 3 días». */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const dia = (f: string) => Date.parse(`${f}T00:00:00Z`);
  const dias = Math.round((dia(fechaLocal(ahora)) - dia(fechaLocal(iso))) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/** Iniciales de un nombre, sin el tratamiento (Dr., Dra.). */
export function iniciales(nombre: string): string {
  const p = nombre.split(/\s+/).filter((x) => x && !/^(dr|dra)\.?$/i.test(x));
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

/** Edad en años a partir de una fecha de nacimiento `AAAA-MM-DD`. */
export function edadDe(nacimiento: string | null, hoy: string = hoyIso()): number | null {
  if (!nacimiento) return null;
  const [a, m, d] = nacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
