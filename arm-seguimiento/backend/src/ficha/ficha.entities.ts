import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/** Transformador de columnas DECIMAL: la base devuelve texto y la API entrega números. */
const decimal = { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) };

export const TIPOS_ANTECEDENTE = ['MORBIDO', 'QUIRURGICO', 'FAMILIAR', 'ALERGIA', 'HABITO', 'MEDICAMENTO'] as const;

/** Antecedente del paciente: mórbido, quirúrgico, familiar, alergia, hábito o medicamento habitual. Se cierra, no se borra. */
@Entity({ name: 'antecedentes' })
export class Antecedente {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ type: 'enum', enum: TIPOS_ANTECEDENTE })
  tipo: (typeof TIPOS_ANTECEDENTE)[number];

  @Column({ type: 'varchar', length: 200 })
  descripcion: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  detalle: string | null;

  @Column({ type: 'enum', enum: ['LEVE', 'MODERADA', 'GRAVE'], nullable: true })
  severidad: 'LEVE' | 'MODERADA' | 'GRAVE' | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reaccion: string | null;

  @Column({ type: 'date', nullable: true })
  desde: string | null;

  @Column({ type: 'boolean', default: true })
  vigente: boolean;

  @Column({ name: 'cerrado_en', type: 'datetime', precision: 6, nullable: true })
  cerradoEn: Date | null;

  @Column({ name: 'registrado_por', type: 'int', unsigned: true })
  registradoPor: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Atención médica. Es un borrador hasta que el médico la cierra; cerrada ya no se edita, solo admite enmiendas. */
@Entity({ name: 'atenciones' })
export class Atencion {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ name: 'medico_id', type: 'int', unsigned: true })
  medicoId: number;

  @Column({ name: 'cita_id', type: 'int', unsigned: true, nullable: true })
  citaId: number | null;

  @Column({ type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  fecha: Date;

  @Column({ type: 'varchar', length: 300 })
  motivo: string;

  @Column({ type: 'text', nullable: true })
  anamnesis: string | null;

  @Column({ name: 'examen_fisico', type: 'text', nullable: true })
  examenFisico: string | null;

  @Column({ type: 'text', nullable: true })
  plan: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;

  @Column({ type: 'enum', enum: ['BORRADOR', 'CERRADA'], default: 'BORRADOR' })
  estado: 'BORRADOR' | 'CERRADA';

  @Column({ name: 'cerrada_en', type: 'datetime', precision: 6, nullable: true })
  cerradaEn: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  updatedAt: Date;
}

/** Signos vitales tomados en una atención (una fila por atención). */
@Entity({ name: 'signos_vitales' })
export class SignosVitales {
  @PrimaryColumn({ name: 'atencion_id', type: 'int', unsigned: true })
  atencionId: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ name: 'pa_sistolica', type: 'smallint', unsigned: true, nullable: true })
  paSistolica: number | null;

  @Column({ name: 'pa_diastolica', type: 'smallint', unsigned: true, nullable: true })
  paDiastolica: number | null;

  @Column({ name: 'frecuencia_cardiaca', type: 'smallint', unsigned: true, nullable: true })
  frecuenciaCardiaca: number | null;

  @Column({ name: 'frecuencia_respiratoria', type: 'smallint', unsigned: true, nullable: true })
  frecuenciaRespiratoria: number | null;

  @Column({ type: 'decimal', precision: 4, scale: 1, nullable: true, transformer: decimal })
  temperatura: number | null;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  saturacion: number | null;

  @Column({ name: 'peso_kg', type: 'decimal', precision: 5, scale: 1, nullable: true, transformer: decimal })
  pesoKg: number | null;

  @Column({ name: 'talla_cm', type: 'decimal', precision: 5, scale: 1, nullable: true, transformer: decimal })
  tallaCm: number | null;
}

/** Diagnóstico del paciente. Los activos forman su lista de problemas. */
@Entity({ name: 'diagnosticos' })
export class Diagnostico {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ name: 'atencion_id', type: 'int', unsigned: true, nullable: true })
  atencionId: number | null;

  @Column({ type: 'varchar', length: 300 })
  descripcion: string;

  @Column({ name: 'codigo_cie10', type: 'varchar', length: 10, nullable: true })
  codigoCie10: string | null;

  @Column({ type: 'boolean', default: false })
  principal: boolean;

  @Column({ type: 'enum', enum: ['ACTIVO', 'RESUELTO', 'DESCARTADO'], default: 'ACTIVO' })
  estado: 'ACTIVO' | 'RESUELTO' | 'DESCARTADO';

  @Column({ name: 'resuelto_en', type: 'datetime', precision: 6, nullable: true })
  resueltoEn: Date | null;

  @Column({ name: 'registrado_por', type: 'int', unsigned: true })
  registradoPor: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Solicitud de examen y su resultado. */
@Entity({ name: 'examenes' })
export class Examen {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ name: 'atencion_id', type: 'int', unsigned: true, nullable: true })
  atencionId: number | null;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'enum', enum: ['LABORATORIO', 'IMAGEN', 'OTRO'] })
  tipo: 'LABORATORIO' | 'IMAGEN' | 'OTRO';

  @Column({ type: 'varchar', length: 500, nullable: true })
  indicaciones: string | null;

  @Column({ type: 'enum', enum: ['SOLICITADO', 'CON_RESULTADO', 'ANULADO'], default: 'SOLICITADO' })
  estado: 'SOLICITADO' | 'CON_RESULTADO' | 'ANULADO';

  @Column({ name: 'fecha_resultado', type: 'date', nullable: true })
  fechaResultado: string | null;

  @Column({ type: 'text', nullable: true })
  resultado: string | null;

  @Column({ name: 'solicitado_por', type: 'int', unsigned: true })
  solicitadoPor: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Archivo adjunto a la ficha. El archivo vive en el disco del servidor, fuera de la web pública. */
@Entity({ name: 'documentos' })
export class Documento {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'paciente_id', type: 'int', unsigned: true })
  pacienteId: number;

  @Column({ name: 'atencion_id', type: 'int', unsigned: true, nullable: true })
  atencionId: number | null;

  @Column({ name: 'examen_id', type: 'int', unsigned: true, nullable: true })
  examenId: number | null;

  @Column({ name: 'nombre_original', type: 'varchar', length: 200 })
  nombreOriginal: string;

  @Column({ name: 'tipo_mime', type: 'varchar', length: 60 })
  tipoMime: string;

  @Column({ type: 'int', unsigned: true })
  tamano: number;

  /** Nombre interno aleatorio del archivo en disco. */
  @Column({ type: 'varchar', length: 80 })
  ruta: string;

  /** SHA-256 del contenido, para detectar alteraciones. */
  @Column({ type: 'char', length: 64 })
  huella: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  descripcion: string | null;

  @Column({ name: 'subido_por', type: 'int', unsigned: true })
  subidoPor: number;

  @Column({ type: 'boolean', default: false })
  anulado: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}

/** Corrección de una atención cerrada. El texto original sigue visible. */
@Entity({ name: 'enmiendas' })
export class Enmienda {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'atencion_id', type: 'int', unsigned: true })
  atencionId: number;

  @Column({ type: 'text' })
  texto: string;

  @Column({ type: 'varchar', length: 200 })
  motivo: string;

  @Column({ name: 'autor_id', type: 'int', unsigned: true })
  autorId: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6, default: () => 'UTC_TIMESTAMP(6)' })
  createdAt: Date;
}
