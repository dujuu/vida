import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/** Regla semanal de atención: un médico atiende cierto día de la semana entre dos horas locales. */
@Entity({ name: 'bloques_horario' })
export class BloqueHorario {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'medico_id', type: 'int', unsigned: true })
  medicoId: number;

  /** Día de la semana: 1 lunes ... 7 domingo. */
  @Column({ name: 'dia_semana', type: 'tinyint', unsigned: true })
  diaSemana: number;

  /** Hora local de inicio, `HH:mm`. */
  @Column({ name: 'hora_inicio', type: 'char', length: 5 })
  horaInicio: string;

  /** Hora local de término, `HH:mm`. */
  @Column({ name: 'hora_fin', type: 'char', length: 5 })
  horaFin: string;

  @Column({ name: 'vigente_desde', type: 'date' })
  vigenteDesde: string;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Excepción de agenda: el médico no atiende entre dos instantes (vacaciones, permiso, etc.). */
@Entity({ name: 'bloqueos' })
export class Bloqueo {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'medico_id', type: 'int', unsigned: true })
  medicoId: number;

  @Column({ type: 'datetime', precision: 6 })
  desde: Date;

  @Column({ type: 'datetime', precision: 6 })
  hasta: Date;

  @Column({ type: 'enum', enum: ['VACACIONES', 'PERMISO', 'OTRO'], default: 'OTRO' })
  motivo: 'VACACIONES' | 'PERMISO' | 'OTRO';

  @Column({ type: 'varchar', length: 200, nullable: true })
  detalle: string | null;

  @Column({ name: 'creado_por', type: 'int', unsigned: true })
  creadoPor: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Día feriado: el centro no atiende. */
@Entity({ name: 'feriados' })
export class Feriado {
  @PrimaryColumn({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', length: 80 })
  nombre: string;
}
