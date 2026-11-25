import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { limpiarTexto } from '../common/texto.util.js';
import { REGEX_NOMBRE_PERSONA, REGEX_TELEFONO } from '../common/validaciones.js';
import { PaginacionDto } from '../common/paginacion.js';
import { Rol } from './rol.enum.js';

export { REGEX_TELEFONO };

/** Datos profesionales de un médico. */
export class PerfilProfesionalDto {
  @IsInt({ message: 'Seleccione una especialidad' })
  @Min(1, { message: 'Seleccione una especialidad' })
  especialidadId: number;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(30, { message: 'El registro profesional es demasiado largo' })
  registroProfesional?: string;

  /** Duración de cada cita en minutos, entre 10 y 120. */
  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número entero de minutos' })
  @Min(10, { message: 'La duración mínima es 10 minutos' })
  @Max(120, { message: 'La duración máxima es 120 minutos' })
  duracionCitaMin?: number;

  @IsOptional()
  @IsBoolean()
  aceptaReservas?: boolean;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(300, { message: 'La presentación no puede superar los 300 caracteres' })
  presentacion?: string;
}

/** Datos personales editables de un usuario. El RUT nunca cambia. */
export class DatosPersonalesDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(10)
  titulo?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(2, { message: 'Los nombres deben tener al menos 2 caracteres' })
  @MaxLength(80, { message: 'Los nombres no pueden superar los 80 caracteres' })
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'Los nombres solo pueden tener letras, espacios y guion' })
  nombres?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(2, { message: 'El apellido paterno debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El apellido paterno no puede superar los 60 caracteres' })
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'El apellido paterno solo puede tener letras, espacios y guion' })
  apellidoPaterno?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(60, { message: 'El apellido materno no puede superar los 60 caracteres' })
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'El apellido materno solo puede tener letras, espacios y guion' })
  apellidoMaterno?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(120)
  correo?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @Matches(REGEX_TELEFONO, { message: 'El teléfono debe tener entre 8 y 12 dígitos (puede llevar + al inicio)' })
  telefono?: string;
}

/** Alta de una persona del personal (o de un paciente que además tendrá otro rol). */
export class CrearUsuarioDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Ingrese el RUT' })
  @IsNotEmpty({ message: 'Ingrese el RUT' })
  @MaxLength(20, { message: 'El RUT es demasiado largo' })
  rut: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(10)
  titulo?: string;

  @Transform(limpiarTexto)
  @IsString({ message: 'Ingrese los nombres' })
  @MinLength(2, { message: 'Los nombres deben tener al menos 2 caracteres' })
  @MaxLength(80, { message: 'Los nombres no pueden superar los 80 caracteres' })
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'Los nombres solo pueden tener letras, espacios y guion' })
  nombres: string;

  @Transform(limpiarTexto)
  @IsString({ message: 'Ingrese el apellido paterno' })
  @MinLength(2, { message: 'El apellido paterno debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El apellido paterno no puede superar los 60 caracteres' })
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'El apellido paterno solo puede tener letras, espacios y guion' })
  apellidoPaterno: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(60, { message: 'El apellido materno no puede superar los 60 caracteres' })
  @Matches(REGEX_NOMBRE_PERSONA, { message: 'El apellido materno solo puede tener letras, espacios y guion' })
  apellidoMaterno?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(120)
  correo?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @Matches(REGEX_TELEFONO, { message: 'El teléfono debe tener entre 8 y 12 dígitos (puede llevar + al inicio)' })
  telefono?: string;

  @IsArray({ message: 'Indique al menos un rol' })
  @ArrayNotEmpty({ message: 'Indique al menos un rol' })
  @ArrayUnique({ message: 'Hay roles repetidos' })
  @IsEnum(Rol, { each: true, message: 'Rol inválido' })
  roles: Rol[];

  /** Obligatorio si se asigna el rol médico. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PerfilProfesionalDto)
  perfilProfesional?: PerfilProfesionalDto;
}

/** Reemplazo de los roles de un usuario. */
export class AsignarRolesDto {
  @IsArray({ message: 'Indique al menos un rol' })
  @ArrayNotEmpty({ message: 'Indique al menos un rol' })
  @ArrayUnique({ message: 'Hay roles repetidos' })
  @IsEnum(Rol, { each: true, message: 'Rol inválido' })
  roles: Rol[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PerfilProfesionalDto)
  perfilProfesional?: PerfilProfesionalDto;
}

/** Filtros del listado de usuarios. */
export class FiltroUsuariosDto extends PaginacionDto {
  @IsOptional()
  @IsEnum(Rol, { message: 'Rol inválido' })
  rol?: Rol;

  @IsOptional()
  @IsIn(['activos', 'inactivos'], { message: 'El estado debe ser activos o inactivos' })
  estado?: 'activos' | 'inactivos';

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(60)
  buscar?: string;
}
