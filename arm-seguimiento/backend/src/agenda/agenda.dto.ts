import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { REGEX_FECHA, REGEX_HORA } from '../common/fechas.util.js';
import { limpiarTexto } from '../common/texto.util.js';

/** Un bloque de atención de la semana tipo. */
export class BloqueDto {
  /** Día de la semana: 1 lunes ... 7 domingo. */
  @IsInt({ message: 'El día de la semana debe ser un número entre 1 y 7' })
  @Min(1, { message: 'El día de la semana debe ser entre 1 y 7' })
  @Max(7, { message: 'El día de la semana debe ser entre 1 y 7' })
  diaSemana: number;

  @Matches(REGEX_HORA, { message: 'La hora de inicio debe tener formato HH:mm' })
  horaInicio: string;

  @Matches(REGEX_HORA, { message: 'La hora de término debe tener formato HH:mm' })
  horaFin: string;
}

/** Reemplazo del horario semanal a partir de una fecha. */
export class ReemplazarBloquesDto {
  /** Primera fecha en que rige el horario nuevo, `AAAA-MM-DD`. */
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  desde: string;

  @IsArray({ message: 'Envíe la lista de bloques' })
  @ArrayMaxSize(50, { message: 'Hay demasiados bloques' })
  @ValidateNested({ each: true })
  @Type(() => BloqueDto)
  bloques: BloqueDto[];

  /** Confirma el cambio aunque deje citas fuera de horario. */
  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;
}

/** Excepción de agenda. Las fechas y horas son locales del centro. */
export class CrearBloqueoDto {
  @Matches(REGEX_FECHA, { message: 'La fecha de inicio debe tener formato AAAA-MM-DD' })
  fechaDesde: string;

  @Matches(REGEX_HORA, { message: 'La hora de inicio debe tener formato HH:mm' })
  horaDesde: string;

  @Matches(REGEX_FECHA, { message: 'La fecha de término debe tener formato AAAA-MM-DD' })
  fechaHasta: string;

  @Matches(REGEX_HORA, { message: 'La hora de término debe tener formato HH:mm' })
  horaHasta: string;

  @IsOptional()
  @IsEnum(['VACACIONES', 'PERMISO', 'OTRO'], { message: 'Motivo inválido' })
  motivo?: 'VACACIONES' | 'PERMISO' | 'OTRO';

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(200, { message: 'El detalle no puede superar los 200 caracteres' })
  detalle?: string;

  /** Confirma el bloqueo aunque haya citas dentro del rango. */
  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;
}

/** Rango de fechas para consultar horas libres. */
export class RangoHorasDto {
  @Matches(REGEX_FECHA, { message: 'La fecha desde debe tener formato AAAA-MM-DD' })
  desde: string;

  @Matches(REGEX_FECHA, { message: 'La fecha hasta debe tener formato AAAA-MM-DD' })
  hasta: string;
}

/** Mes para pintar el calendario de reservas. */
export class DiasConHorasDto {
  @Type(() => Number)
  @IsInt({ message: 'Seleccione una especialidad' })
  @Min(1)
  especialidad: number;

  @Matches(/^\d{4}-\d{2}$/, { message: 'El mes debe tener formato AAAA-MM' })
  mes: string;
}

/** Alta de un feriado. */
export class CrearFeriadoDto {
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  fecha: string;

  @Transform(limpiarTexto)
  @IsString({ message: 'Ingrese el nombre' })
  @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres' })
  nombre: string;
}
