import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const MEDIOS_CONTACTO = ['LLAMADA', 'WHATSAPP', 'CORREO', 'PRESENCIAL'] as const;
export const MOTIVOS_CONTACTO = [
  'RESERVA',
  'REPROGRAMACION',
  'CANCELACION',
  'RECORDATORIO',
  'SEGUIMIENTO',
  'CONSULTA',
  'RECLAMO',
  'OTRO',
] as const;
export const RESULTADOS_CONTACTO = ['RESUELTO', 'SIN_RESPUESTA', 'REQUIERE_SEGUIMIENTO', 'DERIVADO'] as const;

/** Registro de una interacción con un paciente. Es el formulario único para llamada, WhatsApp, correo y atención presencial. */
@Entity({ name: 'contactos' })
export class Contacto {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ type: 'enum', enum: MEDIOS_CONTACTO })
  medio: (typeof MEDIOS_CONTACTO)[number];

  @Column({ type: 'enum', enum: ['ENTRANTE', 'SALIENTE'] })
  sentido: 'ENTRANTE' | 'SALIENTE';

  @Column({ type: 'enum', enum: MOTIVOS_CONTACTO })
  motivo: (typeof MOTIVOS_CONTACTO)[number];

  @Column({ type: 'enum', enum: RESULTADOS_CONTACTO })
  resultado: (typeof RESULTADOS_CONTACTO)[number];

  /** Detalle administrativo. Nunca debe contener datos clínicos. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  detalle: string | null;

  /** Verdadero si el envío por WhatsApp o correo fue simulado (no salió ningún mensaje real). */
  @Column({ type: 'boolean', default: false })
  simulado: boolean;

  @Column({ name: 'responsable_id', type: 'int', unsigned: true })
  responsableId: number;

  @Column({ name: 'cita_id', type: 'int', unsigned: true, nullable: true })
  citaId: number | null;

  @Column({ name: 'proximo_contacto', type: 'date', nullable: true })
  proximoContacto: string | null;

  @Column({ type: 'boolean', default: false })
  cerrado: boolean;

  /** Médico que pidió este seguimiento, si nació desde el dashboard. */
  @Column({ name: 'solicitado_por', type: 'int', unsigned: true, nullable: true })
  solicitadoPor: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}
