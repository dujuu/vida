import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity.js';
import { ModoPauta } from './modo-pauta.enum.js';
import { TipoRecomendacion } from './tipo-recomendacion.enum.js';

/** Estado de una indicación. Una indicación nunca se borra: se suspende, finaliza o anula. */
export enum EstadoRecomendacion {
  ACTIVA = 'ACTIVA',
  SUSPENDIDA = 'SUSPENDIDA',
  FINALIZADA = 'FINALIZADA',
  ANULADA = 'ANULADA',
}

/**
 * Indicación o recomendación de un médico a un paciente.
 *
 * Puede ser un medicamento con pauta horaria, una rutina, un hábito a evitar u otra indicación general. Las
 * dosis, vías y frecuencias las escribe siempre el médico; el sistema no propone ninguna.
 */
@Entity({ name: 'recomendaciones' })
export class Recomendacion {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'doctor_id', type: 'int', unsigned: true })
  doctorId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Usuario>;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paciente_id' })
  paciente: Relation<Usuario>;

  @Column({ type: 'enum', enum: TipoRecomendacion })
  tipo: TipoRecomendacion;

  @Column({ type: 'varchar', length: 150 })
  titulo: string;

  @Column({ type: 'text' })
  descripcion: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;

  @Column({ name: 'leida_at', type: 'datetime', precision: 6, nullable: true })
  leidaAt: Date | null;

  @Column({ name: 'atencion_id', type: 'int', unsigned: true, nullable: true })
  atencionId: number | null;

  /** Primer día de vigencia, `AAAA-MM-DD`. */
  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio: string | null;

  /** Último día de vigencia, `AAAA-MM-DD`. Nulo si no tiene término. */
  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin: string | null;

  @Column({ type: 'enum', enum: EstadoRecomendacion, default: EstadoRecomendacion.ACTIVA })
  estado: EstadoRecomendacion;

  @Column({ name: 'motivo_suspension', type: 'varchar', length: 200, nullable: true })
  motivoSuspension: string | null;

  @Column({ name: 'suspendida_por', type: 'int', unsigned: true, nullable: true })
  suspendidaPor: number | null;

  @Column({ name: 'suspendida_en', type: 'datetime', precision: 6, nullable: true })
  suspendidaEn: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  medicamento: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  presentacion: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  dosis: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  via: string | null;

  @Column({ type: 'smallint', unsigned: true, default: 1 })
  version: number;

  @Column({ name: 'updated_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  updatedAt: Date;
}

/** Copia de una indicación antes de un cambio, para conservar el historial de versiones. */
@Entity({ name: 'recomendaciones_versiones' })
export class RecomendacionVersion {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'recomendacion_id', type: 'int', unsigned: true })
  recomendacionId: number;

  @Column({ type: 'smallint', unsigned: true })
  version: number;

  /** JSON con el contenido que tenía la indicación en esa versión. */
  @Column({ type: 'longtext' })
  contenido: string;

  @Column({ name: 'cambiado_por', type: 'int', unsigned: true })
  cambiadoPor: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

export { ModoPauta };

/** Pauta horaria de una indicación: con qué frecuencia, desde cuándo y por cuántos días. Cada cambio crea una versión nueva. */
@Entity({ name: 'pautas' })
export class Pauta {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'recomendacion_id', type: 'int', unsigned: true })
  recomendacionId: number;

  @Column({ type: 'smallint', unsigned: true })
  version: number;

  @Column({ type: 'enum', enum: ModoPauta })
  modo: ModoPauta;

  @Column({ name: 'intervalo_horas', type: 'smallint', unsigned: true, nullable: true })
  intervaloHoras: number | null;

  /** Horas locales separadas por coma: `08:00,16:00,00:00`. */
  @Column({ name: 'horas_locales', type: 'varchar', length: 100, nullable: true })
  horasLocales: string | null;

  /**
   * Copia del medicamento, presentación, dosis y vía vigentes cuando se creó esta versión. Así las tomas ya
   * registradas conservan su descripción aunque el médico cambie la dosis más tarde.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  medicamento: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  presentacion: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  dosis: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  via: string | null;

  /** Fecha y hora local de la primera toma: `AAAA-MM-DD HH:mm`. */
  @Column({ name: 'inicio_local', type: 'char', length: 16 })
  inicioLocal: string;

  @Column({ name: 'duracion_dias', type: 'smallint', unsigned: true })
  duracionDias: number;

  /** Días de la semana en que aplica (1 lunes ... 7 domingo), separados por coma. Nulo si aplica todos. */
  @Column({ name: 'dias_semana', type: 'varchar', length: 20, nullable: true })
  diasSemana: string | null;

  @Column({ type: 'boolean', default: true })
  vigente: boolean;

  @Column({ name: 'creada_por', type: 'int', unsigned: true })
  creadaPor: number;

  @Column({ name: 'motivo_cambio', type: 'varchar', length: 200, nullable: true })
  motivoCambio: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}
