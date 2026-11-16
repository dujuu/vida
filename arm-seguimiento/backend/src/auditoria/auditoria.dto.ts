import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginacionDto } from '../common/paginacion.js';
import { REGEX_FECHA } from '../common/fechas.util.js';

/** Filtros de la consulta de auditoría. */
export class FiltroAuditoriaDto extends PaginacionDto {
  /** Solo eventos de este usuario. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  usuario?: number;

  /** Solo eventos sobre este paciente. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paciente?: number;

  /** Solo esta acción. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  accion?: string;

  @IsOptional()
  @IsIn(['PERMITIDO', 'DENEGADO', 'ERROR'], { message: 'Resultado inválido' })
  resultado?: string;

  /** Desde esta fecha (`AAAA-MM-DD`), incluida. */
  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  desde?: string;

  /** Hasta esta fecha (`AAAA-MM-DD`), incluida. */
  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  hasta?: string;
}
