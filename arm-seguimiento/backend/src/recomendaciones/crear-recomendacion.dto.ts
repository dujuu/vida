import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { REGEX_FECHA } from '../common/fechas.util.js';
import { PaginacionDto } from '../common/paginacion.js';
import { limpiarTexto } from '../common/texto.util.js';
import { ModoPauta } from './modo-pauta.enum.js';
import { TipoRecomendacion } from './tipo-recomendacion.enum.js';

/**
 * Pauta horaria de un tratamiento. Todo lo escribe el médico: el sistema no propone frecuencias ni duraciones.
 */
export class PautaDto {
  @ApiProperty({ enum: ModoPauta, description: 'Cada N horas, a horas fijas o según necesidad.' })
  @IsEnum(ModoPauta, { message: 'El modo de la pauta no es válido' })
  modo: ModoPauta;

  @ApiProperty({ required: false, example: 8, description: 'Solo para CADA_N_HORAS: horas entre una toma y la siguiente.' })
  @IsOptional()
  @IsInt({ message: 'El intervalo debe ser un número entero de horas' })
  intervaloHoras?: number;

  @ApiProperty({ required: false, example: ['08:00', '20:00'], description: 'Solo para HORAS_FIJAS: horas locales del día.' })
  @IsOptional()
  @IsArray({ message: 'Las horas deben enviarse como una lista' })
  @ArrayMaxSize(12, { message: 'Indique hasta 12 horas' })
  @IsString({ each: true })
  horasLocales?: string[];

  @ApiProperty({ example: '2026-11-20 08:00', description: 'Fecha y hora local de la primera toma.' })
  @IsString({ message: 'Indique la fecha y hora de la primera toma' })
  @Matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, { message: 'El inicio debe tener formato AAAA-MM-DD HH:mm' })
  inicioLocal: string;

  @ApiProperty({ example: 8, description: 'Duración del tratamiento en días.' })
  @IsInt({ message: 'La duración debe ser un número entero de días' })
  @Min(1, { message: 'La duración mínima es 1 día' })
  duracionDias: number;

  @ApiProperty({ required: false, example: [1, 3, 5], description: 'Días de la semana en que aplica (1 lunes ... 7 domingo). Sin valor: todos.' })
  @IsOptional()
  @IsArray({ message: 'Los días de la semana deben enviarse como una lista' })
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  diasSemana?: number[];
}

/** Datos de un medicamento. Los escribe el médico. */
export class DatosMedicamentoDto {
  @ApiProperty({ required: false, example: 'Paracetamol' })
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(120, { message: 'El nombre del medicamento no puede superar los 120 caracteres' })
  medicamento?: string;

  @ApiProperty({ required: false, example: 'Comprimido 500 mg' })
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(80, { message: 'La presentación no puede superar los 80 caracteres' })
  presentacion?: string;

  @ApiProperty({ required: false, example: '1 comprimido' })
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(80, { message: 'La dosis no puede superar los 80 caracteres' })
  dosis?: string;

  @ApiProperty({ required: false, example: 'Oral' })
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(40, { message: 'La vía no puede superar los 40 caracteres' })
  via?: string;
}

/** Creación de una indicación para un paciente. */
export class CrearRecomendacionDto extends DatosMedicamentoDto {
  @ApiProperty({ description: 'Identificador del paciente. Debe tener una relación vigente con el médico.', example: 3, minimum: 1 })
  @IsInt({ message: 'Seleccione un paciente válido' })
  @Min(1, { message: 'Seleccione un paciente válido' })
  pacienteId: number;

  @ApiProperty({ enum: TipoRecomendacion, example: TipoRecomendacion.MEDICAMENTO })
  @IsEnum(TipoRecomendacion, { message: 'El tipo debe ser MEDICAMENTO, RUTINA, HABITO_EVITAR u OTRO' })
  tipo: TipoRecomendacion;

  @ApiProperty({ description: 'Resumen corto de la indicación.', example: 'Paracetamol cada 8 horas', minLength: 3, maxLength: 150 })
  @Transform(limpiarTexto)
  @IsString({ message: 'El título es obligatorio' })
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres' })
  @MaxLength(150, { message: 'El título no puede superar los 150 caracteres' })
  titulo: string;

  @ApiProperty({ description: 'Detalle de la indicación.', example: 'Tome 1 comprimido de 500 mg cada 8 horas, después de las comidas.', minLength: 5, maxLength: 2000 })
  @Transform(limpiarTexto)
  @IsString({ message: 'Las indicaciones son obligatorias' })
  @MinLength(5, { message: 'Las indicaciones deben tener al menos 5 caracteres' })
  @MaxLength(2000, { message: 'Las indicaciones no pueden superar los 2000 caracteres' })
  descripcion: string;

  @ApiProperty({ required: false, description: 'Primer día de vigencia. Si hay pauta, se toma de la pauta.' })
  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha de inicio debe tener formato AAAA-MM-DD' })
  fechaInicio?: string;

  @ApiProperty({ required: false, description: 'Último día de vigencia. Si hay pauta, se calcula con la duración.' })
  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha de término debe tener formato AAAA-MM-DD' })
  fechaFin?: string;

  @ApiProperty({ required: false, description: 'Atención de la que nace la indicación.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  atencionId?: number;

  @ApiProperty({ required: false, type: PautaDto, description: 'Pauta horaria. Sin pauta, es una indicación general.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PautaDto)
  pauta?: PautaDto;
}

/** Vista previa de las tomas que generaría una pauta, sin guardar. */
export class VistaPreviaDto {
  @IsDefined({ message: 'Indique la pauta' })
  @ValidateNested()
  @Type(() => PautaDto)
  pauta: PautaDto;
}

/** Cambio de pauta: crea una versión nueva. Puede cambiar también el medicamento, la dosis y la vía. */
export class ModificarPautaDto extends DatosMedicamentoDto {
  @IsDefined({ message: 'Indique la pauta' })
  @ValidateNested()
  @Type(() => PautaDto)
  pauta: PautaDto;

  @Transform(limpiarTexto)
  @IsString({ message: 'Indique el motivo del cambio' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres' })
  motivo: string;
}

/** Corrección de texto o de la fecha de término de una indicación. */
export class EditarRecomendacionDto extends DatosMedicamentoDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres' })
  @MaxLength(150, { message: 'El título no puede superar los 150 caracteres' })
  titulo?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(5, { message: 'Las indicaciones deben tener al menos 5 caracteres' })
  @MaxLength(2000, { message: 'Las indicaciones no pueden superar los 2000 caracteres' })
  descripcion?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha de término debe tener formato AAAA-MM-DD' })
  fechaFin?: string;

  @Transform(limpiarTexto)
  @IsString({ message: 'Indique el motivo del cambio' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres' })
  motivo: string;
}

/** Suspensión de una indicación. */
export class SuspenderRecomendacionDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Indique el motivo' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres' })
  motivo: string;
}

/** Filtros de los listados de indicaciones. */
export class FiltroRecomendacionesDto extends PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paciente?: number;

  /** `vigentes` (activas dentro de su fecha) o `anteriores` (suspendidas, finalizadas o vencidas). */
  @IsOptional()
  @IsIn(['vigentes', 'anteriores'], { message: 'El estado debe ser vigentes o anteriores' })
  estado?: 'vigentes' | 'anteriores';
}
