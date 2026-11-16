import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { REGEX_FECHA } from '../common/fechas.util.js';
import { PaginacionDto } from '../common/paginacion.js';
import { limpiarTexto } from '../common/texto.util.js';
import { MEDIOS_CONTACTO, MOTIVOS_CONTACTO, RESULTADOS_CONTACTO } from './contacto.entity.js';

/** Registro de un contacto. Los mismos campos obligatorios para todos los medios. */
export class CrearContactoDto {
  @Type(() => Number)
  @IsInt({ message: 'Seleccione un paciente' })
  @Min(1, { message: 'Seleccione un paciente' })
  pacienteId: number;

  @IsIn(MEDIOS_CONTACTO as unknown as string[], { message: 'Medio de contacto inválido' })
  medio: (typeof MEDIOS_CONTACTO)[number];

  @IsEnum(['ENTRANTE', 'SALIENTE'], { message: 'El sentido debe ser ENTRANTE o SALIENTE' })
  sentido: 'ENTRANTE' | 'SALIENTE';

  @IsIn(MOTIVOS_CONTACTO as unknown as string[], { message: 'Motivo inválido' })
  motivo: (typeof MOTIVOS_CONTACTO)[number];

  @IsIn(RESULTADOS_CONTACTO as unknown as string[], { message: 'Resultado inválido' })
  resultado: (typeof RESULTADOS_CONTACTO)[number];

  /** Detalle administrativo. No debe contener datos clínicos. */
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(500, { message: 'El detalle no puede superar los 500 caracteres' })
  detalle?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  citaId?: number;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha del próximo contacto debe tener formato AAAA-MM-DD' })
  proximoContacto?: string;
}

/** Cambios a un contacto ya registrado. */
export class EditarContactoDto {
  @IsOptional()
  @IsIn(RESULTADOS_CONTACTO as unknown as string[], { message: 'Resultado inválido' })
  resultado?: (typeof RESULTADOS_CONTACTO)[number];

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha del próximo contacto debe tener formato AAAA-MM-DD' })
  proximoContacto?: string;

  @IsOptional()
  @IsBoolean()
  cerrado?: boolean;

  /** Nota que se agrega al detalle. Un contacto no se corrige: se le agrega una nota. */
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(2)
  @MaxLength(300, { message: 'La nota no puede superar los 300 caracteres' })
  agregarNota?: string;
}

/** Envío simulado por WhatsApp o correo: se guarda lo que se habría enviado. */
export class EnvioSimuladoDto {
  @Type(() => Number)
  @IsInt({ message: 'Seleccione un paciente' })
  @Min(1)
  pacienteId: number;

  @IsEnum(['WHATSAPP', 'CORREO'], { message: 'El medio debe ser WHATSAPP o CORREO' })
  medio: 'WHATSAPP' | 'CORREO';

  @IsIn(MOTIVOS_CONTACTO as unknown as string[], { message: 'Motivo inválido' })
  motivo: (typeof MOTIVOS_CONTACTO)[number];

  @Transform(limpiarTexto)
  @IsString({ message: 'Escriba el mensaje' })
  @MinLength(3, { message: 'El mensaje debe tener al menos 3 caracteres' })
  @MaxLength(500, { message: 'El mensaje no puede superar los 500 caracteres' })
  texto: string;
}

/** Solicitud de un médico para que recepción contacte a un paciente suyo. */
export class SolicitarSeguimientoDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(300, { message: 'El mensaje no puede superar los 300 caracteres' })
  mensaje?: string;
}

/** Filtros del listado de contactos. */
export class FiltroContactosDto extends PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paciente?: number;

  @IsOptional()
  @IsIn(MEDIOS_CONTACTO as unknown as string[])
  medio?: string;

  @IsOptional()
  @IsIn(RESULTADOS_CONTACTO as unknown as string[])
  resultado?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  desde?: string;
}

/** Consulta de advertencias antes de contactar. */
export class ConsultaAdvertenciasDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paciente: number;

  @IsOptional()
  @IsIn(MEDIOS_CONTACTO as unknown as string[])
  medio?: string;
}
