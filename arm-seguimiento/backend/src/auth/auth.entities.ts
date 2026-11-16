import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Rol } from '../usuarios/rol.enum.js';

/** Sesión iniciada en un navegador. Se puede revocar; el token de renovación se guarda solo como hash. */
@Entity({ name: 'sesiones' })
export class Sesion {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  /** Hash del token anterior: si alguien lo presenta, el token se reutilizó y la sesión se revoca. */
  @Column({ name: 'token_anterior_hash', type: 'char', length: 64, nullable: true })
  tokenAnteriorHash: string | null;

  @Column({ name: 'rol_activo', type: 'enum', enum: Rol, nullable: true })
  rolActivo: Rol | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  agente: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ name: 'expira_en', type: 'datetime', precision: 6 })
  expiraEn: Date;

  @Column({ name: 'revocada_en', type: 'datetime', precision: 6, nullable: true })
  revocadaEn: Date | null;

  @Column({ name: 'ultimo_uso', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  ultimoUso: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Código de un solo uso para activar una cuenta o recuperar el acceso. Se guarda solo como hash. */
@Entity({ name: 'codigos_acceso' })
export class CodigoAcceso {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @Column({ type: 'enum', enum: ['ACTIVACION', 'RECUPERACION'] })
  tipo: 'ACTIVACION' | 'RECUPERACION';

  @Column({ name: 'codigo_hash', type: 'char', length: 64 })
  codigoHash: string;

  @Column({ name: 'expira_en', type: 'datetime', precision: 6 })
  expiraEn: Date;

  @Column({ name: 'usado_en', type: 'datetime', precision: 6, nullable: true })
  usadoEn: Date | null;

  @Column({ name: 'emitido_por', type: 'int', unsigned: true, nullable: true })
  emitidoPor: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Intento de inicio de sesión, para bloquear la fuerza bruta. */
@Entity({ name: 'intentos_login' })
export class IntentoLogin {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 12 })
  rut: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'boolean' })
  exitoso: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}
