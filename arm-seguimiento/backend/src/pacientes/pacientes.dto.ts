import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REGEX_FECHA } from '../common/fechas.util.js';
import { PaginacionDto } from '../common/paginacion.js';
import { limpiarTexto } from '../common/texto.util.js';
import { COMUNAS, comunaOficial } from '../common/divisiones-chile.js';
import { REGEX_NOMBRE_PERSONA, REGEX_TELEFONO } from '../common/validaciones.js';

/** Medios de contacto que el paciente puede preferir. */
export enum MedioPreferido {
  LLAMADA = 'LLAMADA',
  WHATSAPP = 'WHATSAPP',
  CORREO = 'CORREO',
}

/** Datos de contacto y preferencias que recepción o el propio paciente pueden actualizar. */
export class ContactoPacienteDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @Matches(REGEX_TELEFONO, { message: 'El teléfono debe tener entre 8 y 12 dígitos (puede llevar + al inicio)' })
  telefono?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(120)
  correo?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(200, { message: 'La dirección no puede superar los 200 caracteres' })
  direccion?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? (comunaOficial(value) ?? value.trim()) : value))
  @IsIn(COMUNAS, { message: 'Seleccione una comuna de la lista (región, provincia y comuna)' })
  comuna?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(120, { message: 'El nombre del contacto de emergencia es demasiado largo' })
  emergenciaNombre?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @Matches(REGEX_TELEFONO, { message: 'El teléfono de emergencia debe tener entre 8 y 12 dígitos (puede llevar + al inicio)' })
  emergenciaTelefono?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(40, { message: 'El parentesco es demasiado largo' })
  emergenciaParentesco?: string;

  @IsOptional()
  @IsEnum(MedioPreferido, { message: 'Medio de contacto inválido' })
  medioContacto?: MedioPreferido;

  @IsOptional()
  @IsBoolean()
  aceptaRecordatorios?: boolean;
}

/** Datos administrativos que solo recepción puede corregir: identidad y fecha de nacimiento. */
export class EditarPacienteDto extends ContactoPacienteDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(2, { message: 'Los nombres deben tener al menos 2 caracteres' })
  @MaxLength(80)
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'Los nombres solo pueden tener letras, espacios y guion' })
  nombres?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(2, { message: 'El apellido paterno debe tener al menos 2 caracteres' })
  @MaxLength(60)
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'El apellido paterno solo puede tener letras, espacios y guion' })
  apellidoPaterno?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(60)
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'El apellido materno solo puede tener letras, espacios y guion' })
  apellidoMaterno?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha de nacimiento debe tener formato AAAA-MM-DD' })
  fechaNacimiento?: string;

  @IsOptional()
  @IsIn(['F', 'M', 'O'], { message: 'Sexo inválido' })
  sexo?: 'F' | 'M' | 'O';
}

/** Registro de un paciente nuevo por recepción. */
export class CrearPacienteDto extends EditarPacienteDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Ingrese el RUT' })
  @IsNotEmpty({ message: 'Ingrese el RUT' })
  @MaxLength(20, { message: 'El RUT es demasiado largo' })
  rut: string;

  /** El paciente firmó el consentimiento en el mesón. */
  @IsOptional()
  @IsBoolean()
  consentimientoPresencial?: boolean;
}

/** Filtros de la búsqueda de pacientes. */
export class FiltroPacientesDto extends PaginacionDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(60)
  buscar?: string;
}

/** Unión de dos fichas del mismo paciente. */
export class FusionarPacientesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  conservadoId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  fusionadoId: number;

  /** El administrador escribe el RUT del registro que se va a fusionar para confirmar. */
  @Transform(limpiarTexto)
  @IsString({ message: 'Escriba el RUT del registro a fusionar para confirmar' })
  @MaxLength(20)
  rutConfirmacion: string;

  @Transform(limpiarTexto)
  @IsString({ message: 'Indique el motivo' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(200)
  motivo: string;
}
