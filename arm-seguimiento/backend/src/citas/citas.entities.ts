import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Estados de una cita. El único camino de salida de RESERVADA hacia atrás es cancelar o marcar inasistencia. */
export enum EstadoCita {
  RESERVADA = 'RESERVADA',
  EN_ESPERA = 'EN_ESPERA',
  EN_ATENCION = 'EN_ATENCION',
  ATENDIDA = 'ATENDIDA',
  CANCELADA = 'CANCELADA',
  NO_ASISTIO = 'NO_ASISTIO',
}

/** Tipo de cita. */
export enum TipoCita {
  PRIMERA_VEZ = 'PRIMERA_VEZ',
  CONTROL = 'CONTROL',
  EXAMEN = 'EXAMEN',
  OTRO = 'OTRO',
}

/** Canal por el que se reservó la cita. */
export enum CanalCita {
  APP = 'APP',
  MESON = 'MESON',
  TELEFONO = 'TELEFONO',
}

/**
 * Hora médica reservada. `slotActivo` vale la hora de inicio mientras la cita no está cancelada y es NULL al
 * cancelarla; sus restricciones únicas con el médico y con el paciente impiden la doble reserva.
 */
@Entity({ name: 'citas' })
export class Cita {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'medico_id', type: 'int', unsigned: true })
  medicoId: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ type: 'datetime', precision: 6 })
  inicio: Date;

  @Column({ type: 'datetime', precision: 6 })
  fin: Date;

  @Column({ type: 'enum', enum: EstadoCita, default: EstadoCita.RESERVADA })
  estado: EstadoCita;

  @Column({ type: 'enum', enum: TipoCita, default: TipoCita.CONTROL })
  tipo: TipoCita;

  @Column({ type: 'enum', enum: CanalCita })
  canal: CanalCita;

  @Column({ name: 'creada_por', type: 'int', unsigned: true })
  creadaPor: number;

  @Column({ name: 'llegada_en', type: 'datetime', precision: 6, nullable: true })
  llegadaEn: Date | null;

  @Column({ name: 'atendida_en', type: 'datetime', precision: 6, nullable: true })
  atendidaEn: Date | null;

  @Column({ name: 'cancelada_en', type: 'datetime', precision: 6, nullable: true })
  canceladaEn: Date | null;

  @Column({ name: 'cancelada_por', type: 'int', unsigned: true, nullable: true })
  canceladaPor: number | null;

  @Column({ name: 'motivo_cancelacion', type: 'varchar', length: 200, nullable: true })
  motivoCancelacion: string | null;

  @Column({ name: 'reprogramada_desde', type: 'int', unsigned: true, nullable: true })
  reprogramadaDesde: number | null;

  /** Nota administrativa breve. Nunca debe contener datos clínicos. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  nota: string | null;

  @Column({ name: 'slot_activo', type: 'datetime', precision: 6, nullable: true })
  slotActivo: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Cambio de estado de una cita: quién, cuándo y de qué estado a cuál. */
@Entity({ name: 'citas_historial' })
export class CitaHistorial {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'cita_id', type: 'int', unsigned: true })
  citaId: number;

  @Column({ name: 'estado_anterior', type: 'varchar', length: 20, nullable: true })
  estadoAnterior: string | null;

  @Column({ name: 'estado_nuevo', type: 'varchar', length: 20 })
  estadoNuevo: string;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}
