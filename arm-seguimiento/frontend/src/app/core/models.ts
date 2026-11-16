/** Roles del sistema. Una persona puede tener más de uno; en cada sesión actúa con uno solo (el rol activo). */
export type Rol = 'PACIENTE' | 'MEDICO' | 'RECEPCIONISTA' | 'ADMINISTRADOR';

/** Nombre de cada rol para mostrar en pantalla. */
export const ETIQUETA_ROL: Record<Rol, string> = {
  PACIENTE: 'Paciente',
  MEDICO: 'Médico',
  RECEPCIONISTA: 'Recepción',
  ADMINISTRADOR: 'Administración',
};

/** Ícono de cada rol. */
export const ICONO_ROL: Record<Rol, string> = {
  PACIENTE: 'person',
  MEDICO: 'stethoscope',
  RECEPCIONISTA: 'concierge',
  ADMINISTRADOR: 'admin_panel_settings',
};

/** Pantalla de inicio de cada rol. */
export const AREA_DE_ROL: Record<Rol, string> = {
  PACIENTE: '/paciente',
  MEDICO: '/medico',
  RECEPCIONISTA: '/recepcion',
  ADMINISTRADOR: '/admin',
};

/** Usuario tal como lo entrega el servidor. */
export interface Usuario {
  id: number;
  nombre: string;
  rut: string;
  roles: Rol[];
  /** Rol activo de la sesión; nulo hasta que la persona con varios roles elige perfil. */
  rol: Rol | null;
  especialidad: string | null;
  debeCambiarPassword: boolean;
}

/** Respuesta de inicio de sesión, activación, renovación y cambio de perfil. */
export interface LoginRespuesta {
  accessToken: string;
  usuario: Usuario;
}

/** Respuesta paginada de los listados. */
export interface Pagina<T> {
  items: T[];
  total: number;
  pagina: number;
  tamano: number;
}

export type TipoRecomendacion = 'MEDICAMENTO' | 'RUTINA' | 'HABITO_EVITAR' | 'OTRO';

/** Tipos de indicación, para los selectores. */
export const TIPOS: ReadonlyArray<{ valor: TipoRecomendacion; etiqueta: string }> = [
  { valor: 'MEDICAMENTO', etiqueta: 'Medicamento' },
  { valor: 'RUTINA', etiqueta: 'Rutina' },
  { valor: 'HABITO_EVITAR', etiqueta: 'Hábito a evitar' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

/** Ícono de cada tipo de indicación. */
export const ICONO_TIPO: Record<TipoRecomendacion, string> = {
  MEDICAMENTO: 'medication',
  RUTINA: 'directions_walk',
  HABITO_EVITAR: 'block',
  OTRO: 'sticky_note_2',
};

/** Nombre legible de un tipo de indicación. */
export function etiquetaTipo(tipo: string): string {
  return TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

export type EstadoCita = 'RESERVADA' | 'EN_ESPERA' | 'EN_ATENCION' | 'ATENDIDA' | 'CANCELADA' | 'NO_ASISTIO';

/** Cita médica. */
export interface Cita {
  id: number;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  tipo: string;
  canal: string;
  llegadaEn: string | null;
  nota: string | null;
  motivoCancelacion: string | null;
  reprogramadaDesde: number | null;
  medico: { id: number; nombre: string; especialidad: string | null };
  paciente: { id: number; nombre: string; rut: string };
  atencion?: { id: number; estado: string } | null;
}

/** Médico visible para quien reserva. */
export interface Profesional {
  id: number;
  nombre: string;
  especialidadId: number;
  especialidad: string;
  presentacion: string | null;
  duracionCitaMin: number;
  aceptaReservas: boolean;
}

/** Hora libre de un médico. */
export interface HoraLibre {
  inicio: string;
  fin: string;
  hora: string;
}

/** Indicación del médico al paciente. */
export interface Indicacion {
  id: number;
  tipo: TipoRecomendacion;
  titulo: string;
  descripcion: string;
  createdAt: string;
  leidaAt: string | null;
  estado: 'ACTIVA' | 'SUSPENDIDA' | 'FINALIZADA' | 'ANULADA';
  vigente: boolean;
  fechaInicio: string | null;
  fechaFin: string | null;
  medicamento: string | null;
  presentacion: string | null;
  dosis: string | null;
  via: string | null;
  version: number;
  motivoSuspension: string | null;
  tienePauta: boolean;
  doctor: { id: number; nombre: string; especialidad: string | null };
  paciente: { id: number; nombre: string };
}

export type EstadoEvento = 'PENDIENTE' | 'REALIZADA' | 'OMITIDA' | 'ANULADA';

/** Toma programada de un tratamiento. */
export interface Evento {
  id: string;
  programadoEn: string;
  estado: EstadoEvento;
  registradoEn: string | null;
  horaReal: string | null;
  nota: string | null;
  motivoAnulacion: string | null;
  atrasada: boolean;
  puedeMarcar: boolean;
  recomendacion: { id: number; titulo: string; tipo: string; medicamento: string | null; dosis: string | null; via: string | null; presentacion: string | null; doctor: string };
}

/** Aviso de la bandeja. */
export interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  texto: string;
  enlace: string | null;
  createdAt: string;
  leidaEn: string | null;
}

export type EstadoContinuidad = 'AL_DIA' | 'EN_RIESGO' | 'DESERTOR' | 'CERRADO';
