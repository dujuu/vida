import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/** Aviso dentro de la aplicación. Nunca lleva datos clínicos: el detalle está en la pantalla a la que enlaza. */
@Entity({ name: 'notificaciones' })
export class Notificacion {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @Column({ type: 'varchar', length: 40 })
  tipo: string;

  @Column({ type: 'varchar', length: 120 })
  titulo: string;

  @Column({ type: 'varchar', length: 300 })
  texto: string;

  /** Ruta interna de la aplicación a la que lleva el aviso. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  enlace: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;

  @Column({ name: 'leida_en', type: 'datetime', precision: 6, nullable: true })
  leidaEn: Date | null;
}

/** Preferencias de aviso de un usuario. */
@Entity({ name: 'preferencias_aviso' })
export class PreferenciaAviso {
  @PrimaryColumn({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @Column({ name: 'avisos_tomas', type: 'boolean', default: true })
  avisosTomas: boolean;

  @Column({ name: 'avisos_citas', type: 'boolean', default: true })
  avisosCitas: boolean;

  /** Inicio del horario de silencio, `HH:mm`. */
  @Column({ name: 'silencio_desde', type: 'char', length: 5, nullable: true })
  silencioDesde: string | null;

  /** Fin del horario de silencio, `HH:mm`. */
  @Column({ name: 'silencio_hasta', type: 'char', length: 5, nullable: true })
  silencioHasta: string | null;
}
