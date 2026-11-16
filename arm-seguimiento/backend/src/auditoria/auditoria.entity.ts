import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Registro de auditoría: quién hizo qué sobre qué paciente. Es solo de inserción (la base lo impone con
 * disparadores) y nunca guarda contenido clínico, solo identificadores.
 */
@Entity({ name: 'auditoria' })
export class Auditoria {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  fecha: Date;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true, nullable: true })
  usuarioId: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rol: string | null;

  @Column({ type: 'varchar', length: 40 })
  accion: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  recurso: string | null;

  @Column({ name: 'recurso_id', type: 'varchar', length: 40, nullable: true })
  recursoId: string | null;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true, nullable: true })
  pacienteId: number | null;

  @Column({ type: 'enum', enum: ['PERMITIDO', 'DENEGADO', 'ERROR'], default: 'PERMITIDO' })
  resultado: 'PERMITIDO' | 'DENEGADO' | 'ERROR';

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  agente: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  detalle: string | null;
}
