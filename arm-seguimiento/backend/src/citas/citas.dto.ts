import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { REGEX_FECHA } from '../common/fechas.util.js';
import { PaginacionDto } from '../common/paginacion.js';
import { limpiarTexto } from '../common/texto.util.js';
import { CanalCita, EstadoCita, TipoCita } from './citas.entities.js';

/** Reserva de una hora. */
export class ReservarCitaDto {
  @Type(() => Number)
  @IsInt({ message: 'Seleccione un médico' })
  @Min(1, { message: 'Seleccione un médico' })
  medicoId: number;

  /** Paciente. Lo indica recepción; el paciente reserva siempre para sí mismo. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Seleccione un paciente' })
  @Min(1, { message: 'Seleccione un paciente' })
  pacienteId?: number;

  /** Inicio de la cita, instante ISO 8601 (por ejemplo `2026-11-20T13:00:00.000Z`). */
  @IsISO8601({ strict: true }, { message: 'La hora de inicio no es válida' })
  inicio: string;

  @IsOptional()
  @IsEnum(TipoCita, { message: 'Tipo de cita inválido' })
  tipo?: TipoCita;

  /** Canal que usa recepción: en el mesón o por teléfono. */
  @IsOptional()
  @IsEnum([CanalCita.MESON, CanalCita.TELEFONO], { message: 'El canal debe ser MESON o TELEFONO' })
  canal?: CanalCita;

  /** Nota administrativa breve. No debe contener datos clínicos. */
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(200, { message: 'La nota no puede superar los 200 caracteres' })
  nota?: string;
}

/** Cancelación con motivo. */
export class CancelarCitaDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Indique el motivo' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres' })
  motivo: string;
}

/** Cambio de hora de una cita. */
export class ReprogramarCitaDto {
  @IsISO8601({ strict: true }, { message: 'La hora de inicio no es válida' })
  inicio: string;
}

/** Cierre de una atención en curso. */
export class FinalizarCitaDto {
  /** El médico declara que no registró una atención clínica para esta cita. */
  @IsOptional()
  @IsBoolean()
  sinAtencion?: boolean;
}

/** Filtros de la agenda de recepción y administración. */
export class FiltroCitasDto extends PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  medico?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paciente?: number;

  /** Un solo día, `AAAA-MM-DD`. */
  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  fecha?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha desde debe tener formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha hasta debe tener formato AAAA-MM-DD' })
  hasta?: string;

  @IsOptional()
  @IsEnum(EstadoCita, { message: 'Estado inválido' })
  estado?: EstadoCita;
}

/** Filtro de las citas de un paciente. */
export class FiltroMisCitasDto extends PaginacionDto {
  /** `proximas` o `historial`. Sin valor, todas. */
  @IsOptional()
  @IsEnum(['proximas', 'historial'], { message: 'El filtro debe ser proximas o historial' })
  estado?: 'proximas' | 'historial';
}
