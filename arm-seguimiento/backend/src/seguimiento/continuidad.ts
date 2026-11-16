/** Estado de continuidad de un paciente con un médico (el "estado del hilo" del Acta). */
export type EstadoContinuidad = 'AL_DIA' | 'EN_RIESGO' | 'DESERTOR' | 'CERRADO';

/** Datos de un paciente con un médico, de los que sale su estado de continuidad. Todas las fechas en UTC. */
export interface SenalesContinuidad {
  ahora: Date;
  /** Hay una cita futura activa con este médico. */
  tieneCitaFutura: boolean;
  /** Última cita atendida con este médico. */
  ultimaAtendida: Date | null;
  /** Última inasistencia. */
  ultimaInasistencia: Date | null;
  /** Última reserva hecha (un paciente que reserva está comprometido). */
  ultimaReserva: Date | null;
  /** Última toma que el paciente marcó (realizada u omitida). */
  ultimaToma: Date | null;
  /** Hora de la primera toma ya vencida de los tratamientos activos. */
  primeraTomaVencida: Date | null;
  /** Última vez que el paciente leyó una indicación. */
  ultimaLectura: Date | null;
  /** Desde cuándo hay indicaciones activas sin leer. */
  sinLeerDesde: Date | null;
  /**
   * Última vez que el médico hizo algo por este paciente (crear una indicación o abrir la relación). Sirve de punto de
   * partida cuando el paciente aún no tiene ninguna actividad: un paciente al que recién se le indicó algo no es desertor.
   */
  ultimoContactoMedico: Date | null;
  /** Indicaciones activas dentro de su fecha. */
  tratamientosVigentes: number;
  /** De esas, las que tienen pauta horaria (generan tomas). */
  tratamientosConPauta: number;
}

/** Umbrales configurables. */
export interface UmbralesContinuidad {
  /** Días sin registro para considerar a un paciente en riesgo. */
  riesgoDias: number;
  /** Días sin actividad para considerar a un paciente desertor. */
  desercionDias: number;
}

/** Resultado de la clasificación: el estado y, en palabras, por qué. */
export interface ResultadoContinuidad {
  estado: EstadoContinuidad;
  motivo: string;
  /** Última actividad del paciente con este médico. */
  ultimaActividad: Date | null;
  diasSinActividad: number | null;
}

const DIA_MS = 86_400_000;
const dias = (desde: Date | null, hasta: Date): number | null => (desde ? Math.floor((hasta.getTime() - desde.getTime()) / DIA_MS) : null);
const maxFecha = (...fechas: Array<Date | null>): Date | null => fechas.filter((f): f is Date => !!f).reduce<Date | null>((m, f) => (!m || f > m ? f : m), null);

/**
 * Clasifica a un paciente según su continuidad con un médico. Es una función pura.
 *
 * Orden de las reglas:
 * 1. **Desertor:** sin cita futura, sin actividad hace `desercionDias` o más, y con tratamiento vigente o un control
 *    pendiente (se asume pendiente si su última atención fue hace menos de 180 días).
 * 2. **En riesgo:** tratamiento con pauta sin ningún registro hace `riesgoDias` o más; o indicaciones sin leer por
 *    `riesgoDias` o más; o una inasistencia sin cita nueva.
 * 3. **Al día:** cita futura, o tratamiento vigente con registro reciente.
 * 4. **Cerrado:** sin tratamientos vigentes ni controles pendientes.
 *
 * La actividad es lo más reciente entre una atención, una toma marcada, una lectura de indicación o una reserva.
 * Lo que el paciente marca es un autorreporte: la ausencia de registro no prueba que no tomó el medicamento.
 */
export function clasificarContinuidad(s: SenalesContinuidad, u: UmbralesContinuidad): ResultadoContinuidad {
  const ultimaActividad = maxFecha(s.ultimaAtendida, s.ultimaToma, s.ultimaLectura, s.ultimaReserva);
  // Sin actividad del paciente, se cuenta desde la última acción del médico.
  const diasSinActividad = dias(ultimaActividad ?? s.ultimoContactoMedico, s.ahora);
  const controlPendiente = s.ultimaAtendida !== null && (dias(s.ultimaAtendida, s.ahora) ?? 9999) < 180;
  const base = { ultimaActividad, diasSinActividad };

  if (!s.tieneCitaFutura && (diasSinActividad !== null && diasSinActividad >= u.desercionDias) && (s.tratamientosVigentes > 0 || controlPendiente)) {
    return { estado: 'DESERTOR', motivo: `Sin actividad hace ${diasSinActividad} días y sin cita futura`, ...base };
  }

  if (s.tratamientosConPauta > 0) {
    const referencia = s.ultimaToma ?? s.primeraTomaVencida;
    const sinRegistro = dias(referencia, s.ahora);
    if (referencia && sinRegistro !== null && sinRegistro >= u.riesgoDias && (!s.ultimaToma || sinRegistro >= u.riesgoDias)) {
      return { estado: 'EN_RIESGO', motivo: s.ultimaToma ? `Tratamiento sin registro hace ${sinRegistro} días` : `No ha registrado ninguna toma desde hace ${sinRegistro} días`, ...base };
    }
  }
  const sinLeer = dias(s.sinLeerDesde, s.ahora);
  if (sinLeer !== null && sinLeer >= u.riesgoDias) {
    return { estado: 'EN_RIESGO', motivo: `Indicaciones sin leer hace ${sinLeer} días`, ...base };
  }
  if (s.ultimaInasistencia && !s.tieneCitaFutura && (!s.ultimaAtendida || s.ultimaInasistencia > s.ultimaAtendida)) {
    return { estado: 'EN_RIESGO', motivo: 'Faltó a su última cita y no tiene una nueva', ...base };
  }

  if (s.tieneCitaFutura) return { estado: 'AL_DIA', motivo: 'Tiene una cita futura', ...base };
  if (s.tratamientosVigentes > 0) return { estado: 'AL_DIA', motivo: 'Tratamiento vigente con actividad reciente', ...base };
  return { estado: 'CERRADO', motivo: 'Sin tratamientos vigentes ni controles pendientes', ...base };
}
