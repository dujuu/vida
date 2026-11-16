import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Parámetro de configuración del sistema, editable por el administrador. */
@Entity({ name: 'configuracion' })
export class Configuracion {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  clave: string;

  @Column({ type: 'varchar', length: 200 })
  valor: string;

  @Column({ type: 'varchar', length: 200 })
  descripcion: string;

  @Column({ name: 'modificado_por', type: 'int', unsigned: true, nullable: true })
  modificadoPor: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  updatedAt: Date;
}
