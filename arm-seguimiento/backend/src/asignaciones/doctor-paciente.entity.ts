import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Relación de atención entre un médico y un paciente. Es la llave de todo acceso clínico: sin una relación
 * vigente, el médico no ve nada del paciente.
 */
@Entity({ name: 'doctor_paciente' })
export class DoctorPaciente {
  @PrimaryColumn({ name: 'doctor_id', type: 'int', unsigned: true })
  doctorId: number;

  @PrimaryColumn({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;

  /** Cómo nació el vínculo: por una cita, a mano o por la carga inicial. */
  @Column({ type: 'enum', enum: ['CITA', 'MANUAL', 'INICIAL'], default: 'INICIAL' })
  origen: 'CITA' | 'MANUAL' | 'INICIAL';

  @Column({ name: 'creada_por', type: 'int', unsigned: true, nullable: true })
  creadaPor: number | null;

  @Column({ type: 'boolean', default: true })
  vigente: boolean;

  @Column({ name: 'cerrada_en', type: 'datetime', precision: 6, nullable: true })
  cerradaEn: Date | null;

  @Column({ name: 'motivo_cierre', type: 'varchar', length: 200, nullable: true })
  motivoCierre: string | null;
}
