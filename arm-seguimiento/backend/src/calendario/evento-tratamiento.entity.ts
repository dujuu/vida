import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Estado de una toma programada. Una toma no marcada queda PENDIENTE para siempre ("sin registro"). */
export enum EstadoEvento {
  PENDIENTE = 'PENDIENTE',
  REALIZADA = 'REALIZADA',
  OMITIDA = 'OMITIDA',
  ANULADA = 'ANULADA',
}

/** Toma programada de un tratamiento, generada a partir de una pauta. El paciente declara si la realizó. */
@Entity({ name: 'eventos_tratamiento' })
export class EventoTratamiento {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'pauta_id', type: 'int', unsigned: true })
  pautaId: number;

  @Column({ name: 'recomendacion_id', type: 'int', unsigned: true })
  recomendacionId: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  /** Instante programado, en UTC. */
  @Column({ name: 'programado_en', type: 'datetime', precision: 6 })
  programadoEn: Date;

  @Column({ type: 'enum', enum: EstadoEvento, default: EstadoEvento.PENDIENTE })
  estado: EstadoEvento;

  @Column({ name: 'registrado_en', type: 'datetime', precision: 6, nullable: true })
  registradoEn: Date | null;

  @Column({ name: 'hora_real', type: 'datetime', precision: 6, nullable: true })
  horaReal: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nota: string | null;

  @Column({ name: 'motivo_anulacion', type: 'varchar', length: 200, nullable: true })
  motivoAnulacion: string | null;
}
