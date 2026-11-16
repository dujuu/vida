import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/** Especialidad médica del catálogo del centro. */
@Entity({ name: 'especialidades' })
export class Especialidad {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 80, unique: true })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activa: boolean;
}

/** Datos profesionales de un usuario con rol médico. */
@Entity({ name: 'perfil_profesional' })
export class PerfilProfesional {
  @PrimaryColumn({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @Column({ name: 'especialidad_id', type: 'int', unsigned: true })
  especialidadId: number;

  @Column({ name: 'registro_profesional', type: 'varchar', length: 30, nullable: true })
  registroProfesional: string | null;

  /** Duración de cada cita de este médico, en minutos. Todas sus citas duran lo mismo. */
  @Column({ name: 'duracion_cita_min', type: 'smallint', unsigned: true, default: 30 })
  duracionCitaMin: number;

  @Column({ name: 'acepta_reservas', type: 'boolean', default: true })
  aceptaReservas: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  presentacion: string | null;
}
