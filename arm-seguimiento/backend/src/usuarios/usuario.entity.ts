import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Rol } from './rol.enum.js';

/**
 * Persona del sistema. Toda persona (paciente, médico, recepcionista o administrador) es una fila de esta
 * tabla, identificada por su RUT. Una cuenta sin contraseña está sin activar. Los roles están en `usuario_rol`.
 */
@Entity({ name: 'usuarios' })
export class Usuario {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  /** RUT normalizado, sin puntos y con guion: `12345678-5`. */
  @Column({ type: 'varchar', length: 12, unique: true })
  rut: string;

  /** Tratamiento que antecede al nombre, por ejemplo `Dr.` o `Dra.`. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  titulo: string | null;

  @Column({ type: 'varchar', length: 80 })
  nombres: string;

  @Column({ name: 'apellido_paterno', type: 'varchar', length: 60 })
  apellidoPaterno: string;

  @Column({ name: 'apellido_materno', type: 'varchar', length: 60, nullable: true })
  apellidoMaterno: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  correo: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 100, nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ name: 'debe_cambiar_password', type: 'boolean', default: false })
  debeCambiarPassword: boolean;

  @Column({ name: 'ultimo_acceso', type: 'datetime', precision: 6, nullable: true })
  ultimoAcceso: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;

  /** Nombre para mostrar en pantalla: título, nombres y apellidos. */
  get nombre(): string {
    return [this.titulo, this.nombres, this.apellidoPaterno, this.apellidoMaterno].filter((x) => !!x).join(' ');
  }
}

/** Rol de una persona. Un usuario tiene una fila por cada rol que puede ejercer. */
@Entity({ name: 'usuario_rol' })
export class UsuarioRol {
  @PrimaryColumn({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @PrimaryColumn({ type: 'enum', enum: Rol })
  rol: Rol;

  @Column({ name: 'asignado_por', type: 'int', unsigned: true, nullable: true })
  asignadoPor: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}
