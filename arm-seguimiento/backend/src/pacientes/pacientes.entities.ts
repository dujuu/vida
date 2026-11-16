import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/** Datos administrativos de un paciente. No contiene nada clínico. */
@Entity({ name: 'perfil_paciente' })
export class PerfilPaciente {
  @PrimaryColumn({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  /** Fecha de nacimiento, `AAAA-MM-DD`. */
  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  fechaNacimiento: string | null;

  @Column({ type: 'enum', enum: ['F', 'M', 'O'], nullable: true })
  sexo: 'F' | 'M' | 'O' | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  direccion: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  comuna: string | null;

  @Column({ name: 'emergencia_nombre', type: 'varchar', length: 120, nullable: true })
  emergenciaNombre: string | null;

  @Column({ name: 'emergencia_telefono', type: 'varchar', length: 20, nullable: true })
  emergenciaTelefono: string | null;

  @Column({ name: 'emergencia_parentesco', type: 'varchar', length: 40, nullable: true })
  emergenciaParentesco: string | null;

  @Column({ name: 'medio_contacto', type: 'enum', enum: ['LLAMADA', 'WHATSAPP', 'CORREO'], nullable: true })
  medioContacto: 'LLAMADA' | 'WHATSAPP' | 'CORREO' | null;

  @Column({ name: 'acepta_recordatorios', type: 'boolean', default: true })
  aceptaRecordatorios: boolean;

  @Column({ name: 'registrado_por', type: 'int', unsigned: true, nullable: true })
  registradoPor: number | null;
}

/** Aceptación del texto de consentimiento sobre el uso de datos de salud. */
@Entity({ name: 'consentimientos' })
export class Consentimiento {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ type: 'smallint', unsigned: true })
  version: number;

  @Column({ type: 'enum', enum: ['APP', 'PRESENCIAL'] })
  medio: 'APP' | 'PRESENCIAL';

  @CreateDateColumn({ name: 'aceptado_en', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  aceptadoEn: Date;

  @Column({ name: 'registrado_por', type: 'int', unsigned: true, nullable: true })
  registradoPor: number | null;
}
