import type { DataSourceOptions } from 'typeorm';
import { Auditoria } from '../auditoria/auditoria.entity.js';
import { BloqueHorario, Bloqueo, Feriado } from '../agenda/agenda.entities.js';
import { DoctorPaciente } from '../asignaciones/doctor-paciente.entity.js';
import { CodigoAcceso, IntentoLogin, Sesion } from '../auth/auth.entities.js';
import { EventoTratamiento } from '../calendario/evento-tratamiento.entity.js';
import { Cita, CitaHistorial } from '../citas/citas.entities.js';
import { Configuracion } from '../configuracion/configuracion.entity.js';
import { Contacto } from '../contactos/contacto.entity.js';
import {
  Antecedente,
  Atencion,
  Diagnostico,
  Documento,
  Enmienda,
  Examen,
  SignosVitales,
} from '../ficha/ficha.entities.js';
import { Notificacion, PreferenciaAviso } from '../notificaciones/notificaciones.entities.js';
import { Consentimiento, PerfilPaciente } from '../pacientes/pacientes.entities.js';
import { Especialidad, PerfilProfesional } from '../profesionales/profesionales.entities.js';
import { Pauta, Recomendacion, RecomendacionVersion } from '../recomendaciones/recomendacion.entity.js';
import { Usuario, UsuarioRol } from '../usuarios/usuario.entity.js';
import { CreateUsuarios1793660000001 } from './migrations/1793660000001-CreateUsuarios.js';
import { CreateDoctorPaciente1793660000002 } from './migrations/1793660000002-CreateDoctorPaciente.js';
import { CreateRecomendaciones1793660000003 } from './migrations/1793660000003-CreateRecomendaciones.js';
import { ExtenderUsuarios1793660000004 } from './migrations/1793660000004-ExtenderUsuarios.js';
import { CrearPerfilesYCatalogos1793660000005 } from './migrations/1793660000005-CrearPerfilesYCatalogos.js';
import { CrearSesiones1793660000006 } from './migrations/1793660000006-CrearSesiones.js';
import { AmpliarRelacionMedicoPaciente1793660000007 } from './migrations/1793660000007-AmpliarRelacionMedicoPaciente.js';
import { CrearAgendaCitasContactos1793660000008 } from './migrations/1793660000008-CrearAgendaCitasContactos.js';
import { CrearFichaClinica1793660000009 } from './migrations/1793660000009-CrearFichaClinica.js';
import { CrearTratamientos1793660000010 } from './migrations/1793660000010-CrearTratamientos.js';
import { CrearAvisosYAuditoria1793660000011 } from './migrations/1793660000011-CrearAvisosYAuditoria.js';

/** Todas las entidades del sistema. */
export const ENTIDADES = [
  Usuario,
  UsuarioRol,
  Sesion,
  CodigoAcceso,
  IntentoLogin,
  Especialidad,
  PerfilProfesional,
  PerfilPaciente,
  Consentimiento,
  DoctorPaciente,
  BloqueHorario,
  Bloqueo,
  Feriado,
  Cita,
  CitaHistorial,
  Contacto,
  Antecedente,
  Atencion,
  SignosVitales,
  Diagnostico,
  Examen,
  Documento,
  Enmienda,
  Recomendacion,
  RecomendacionVersion,
  Pauta,
  EventoTratamiento,
  Notificacion,
  PreferenciaAviso,
  Auditoria,
  Configuracion,
];

/** Migraciones en orden. El esquema solo cambia por aquí. */
export const MIGRACIONES = [
  CreateUsuarios1793660000001,
  CreateDoctorPaciente1793660000002,
  CreateRecomendaciones1793660000003,
  ExtenderUsuarios1793660000004,
  CrearPerfilesYCatalogos1793660000005,
  CrearSesiones1793660000006,
  AmpliarRelacionMedicoPaciente1793660000007,
  CrearAgendaCitasContactos1793660000008,
  CrearFichaClinica1793660000009,
  CrearTratamientos1793660000010,
  CrearAvisosYAuditoria1793660000011,
];

/**
 * Arma la configuración de conexión a MariaDB a partir de las variables de entorno.
 *
 * @param env Variables de entorno (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`).
 * @returns Opciones de TypeORM compartidas por la aplicación y por la línea de comandos de migraciones.
 */
export function buildDataSourceOptions(
  env: Record<string, string | undefined>,
): DataSourceOptions {
  return {
    type: 'mariadb',
    host: env.DB_HOST ?? '127.0.0.1',
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z', // fechas siempre en UTC; el frontend las muestra en hora local
    entities: ENTIDADES,
    migrations: MIGRACIONES,
    migrationsTableName: 'migrations',
    synchronize: false, // el esquema se gestiona solo con migraciones
  };
}
