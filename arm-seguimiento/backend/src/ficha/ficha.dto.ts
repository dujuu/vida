import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { REGEX_FECHA } from '../common/fechas.util.js';
import { PaginacionDto } from '../common/paginacion.js';
import { limpiarTexto } from '../common/texto.util.js';
import { TIPOS_ANTECEDENTE } from './ficha.entities.js';

const texto = (max: number, nombre: string) => [Transform(limpiarTexto), IsString({ message: `${nombre} debe ser un texto` }), MaxLength(max, { message: `${nombre} no puede superar los ${max} caracteres` })];
const aplicar = (...decoradores: PropertyDecorator[]) => (t: object, k: string | symbol) => decoradores.forEach((d) => d(t, k));

/** Alta de un antecedente del paciente. */
export class CrearAntecedenteDto {
  @IsIn(TIPOS_ANTECEDENTE as unknown as string[], { message: 'Tipo de antecedente inválido' })
  tipo: (typeof TIPOS_ANTECEDENTE)[number];

  @Transform(limpiarTexto)
  @IsString({ message: 'Describa el antecedente' })
  @MinLength(2, { message: 'La descripción debe tener al menos 2 caracteres' })
  @MaxLength(200, { message: 'La descripción no puede superar los 200 caracteres' })
  descripcion: string;

  @IsOptional()
  @aplicar(...texto(1000, 'El detalle'))
  detalle?: string;

  /** Solo para alergias. */
  @IsOptional()
  @IsEnum(['LEVE', 'MODERADA', 'GRAVE'], { message: 'Severidad inválida' })
  severidad?: 'LEVE' | 'MODERADA' | 'GRAVE';

  @IsOptional()
  @aplicar(...texto(200, 'La reacción'))
  reaccion?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  desde?: string;
}

/** Corrección o cierre de un antecedente. Un antecedente no se borra: se cierra. */
export class EditarAntecedenteDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  descripcion?: string;

  @IsOptional()
  @aplicar(...texto(1000, 'El detalle'))
  detalle?: string;

  @IsOptional()
  @IsEnum(['LEVE', 'MODERADA', 'GRAVE'], { message: 'Severidad inválida' })
  severidad?: 'LEVE' | 'MODERADA' | 'GRAVE';

  @IsOptional()
  @aplicar(...texto(200, 'La reacción'))
  reaccion?: string;

  /** `false` cierra el antecedente. */
  @IsOptional()
  @IsBoolean()
  vigente?: boolean;
}

/** Filtros de antecedentes. */
export class FiltroAntecedentesDto {
  @IsOptional()
  @IsIn(TIPOS_ANTECEDENTE as unknown as string[], { message: 'Tipo de antecedente inválido' })
  tipo?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  soloVigentes?: boolean;
}

/** Apertura de una atención en borrador. */
export class CrearAtencionDto {
  @Type(() => Number)
  @IsInt({ message: 'Seleccione un paciente' })
  @Min(1)
  pacienteId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  citaId?: number;

  @Transform(limpiarTexto)
  @IsString({ message: 'Escriba el motivo de consulta' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(300, { message: 'El motivo no puede superar los 300 caracteres' })
  motivo: string;

  @IsOptional()
  @aplicar(...texto(10000, 'La anamnesis'))
  anamnesis?: string;

  @IsOptional()
  @aplicar(...texto(10000, 'El examen físico'))
  examenFisico?: string;

  @IsOptional()
  @aplicar(...texto(10000, 'El plan'))
  plan?: string;

  @IsOptional()
  @aplicar(...texto(10000, 'Las observaciones'))
  observaciones?: string;
}

/** Edición de un borrador. */
export class EditarAtencionDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(300, { message: 'El motivo no puede superar los 300 caracteres' })
  motivo?: string;

  @IsOptional()
  @aplicar(...texto(10000, 'La anamnesis'))
  anamnesis?: string;

  @IsOptional()
  @aplicar(...texto(10000, 'El examen físico'))
  examenFisico?: string;

  @IsOptional()
  @aplicar(...texto(10000, 'El plan'))
  plan?: string;

  @IsOptional()
  @aplicar(...texto(10000, 'Las observaciones'))
  observaciones?: string;
}

const entero = (min: number, max: number, nombre: string) =>
  aplicar(IsOptional(), IsInt({ message: `${nombre} debe ser un número entero` }), Min(min, { message: `${nombre} debe ser al menos ${min}` }), Max(max, { message: `${nombre} no puede superar ${max}` }));
const decimal = (min: number, max: number, nombre: string) =>
  aplicar(IsOptional(), IsNumber({ maxDecimalPlaces: 1 }, { message: `${nombre} debe ser un número con un decimal como máximo` }), Min(min, { message: `${nombre} debe ser al menos ${min}` }), Max(max, { message: `${nombre} no puede superar ${max}` }));

/** Signos vitales de una atención. Los rangos son amplios: atrapan errores de tipeo, no juzgan clínicamente. */
export class SignosVitalesDto {
  @entero(50, 260, 'La presión sistólica')
  paSistolica?: number;

  @entero(30, 160, 'La presión diastólica')
  paDiastolica?: number;

  @entero(20, 250, 'La frecuencia cardíaca')
  frecuenciaCardiaca?: number;

  @entero(5, 80, 'La frecuencia respiratoria')
  frecuenciaRespiratoria?: number;

  @decimal(30, 45, 'La temperatura')
  temperatura?: number;

  @entero(50, 100, 'La saturación')
  saturacion?: number;

  @decimal(0.3, 400, 'El peso')
  pesoKg?: number;

  @decimal(30, 250, 'La talla')
  tallaCm?: number;
}

/** Corrección de una atención cerrada. */
export class EnmiendaDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Escriba la corrección' })
  @MinLength(3, { message: 'La corrección debe tener al menos 3 caracteres' })
  @MaxLength(10000)
  texto: string;

  @Transform(limpiarTexto)
  @IsString({ message: 'Indique el motivo' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(200)
  motivo: string;
}

/** Alta de un diagnóstico. El código CIE-10 es opcional y libre; el diagnóstico válido es la descripción del médico. */
export class CrearDiagnosticoDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Describa el diagnóstico' })
  @MinLength(3, { message: 'La descripción debe tener al menos 3 caracteres' })
  @MaxLength(300, { message: 'La descripción no puede superar los 300 caracteres' })
  descripcion: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @Matches(/^[A-Za-z]\d{2}(\.\d{1,2})?$/, { message: 'El código CIE-10 debe tener un formato como J06.9' })
  codigoCie10?: string;

  @IsOptional()
  @IsBoolean()
  principal?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  atencionId?: number;
}

/** Cambio de estado de un diagnóstico. */
export class EditarDiagnosticoDto {
  @IsOptional()
  @IsEnum(['ACTIVO', 'RESUELTO', 'DESCARTADO'], { message: 'Estado inválido' })
  estado?: 'ACTIVO' | 'RESUELTO' | 'DESCARTADO';

  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}

/** Solicitud de un examen. */
export class CrearExamenDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Escriba el nombre del examen' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(150, { message: 'El nombre no puede superar los 150 caracteres' })
  nombre: string;

  @IsEnum(['LABORATORIO', 'IMAGEN', 'OTRO'], { message: 'Tipo de examen inválido' })
  tipo: 'LABORATORIO' | 'IMAGEN' | 'OTRO';

  @IsOptional()
  @aplicar(...texto(500, 'Las indicaciones'))
  indicaciones?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  atencionId?: number;
}

/** Registro del resultado de un examen, o su anulación. */
export class EditarExamenDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  resultado?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  fechaResultado?: string;

  @IsOptional()
  @IsBoolean()
  anular?: boolean;
}

/** Campos que acompañan al archivo subido. */
export class SubirDocumentoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  atencionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  examenId?: number;

  @IsOptional()
  @aplicar(...texto(200, 'La descripción'))
  descripcion?: string;
}

/** Paginación del historial de atenciones. */
export class FiltroAtencionesDto extends PaginacionDto {}
