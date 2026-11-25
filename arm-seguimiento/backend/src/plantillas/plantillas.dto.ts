import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { limpiarTexto } from '../common/texto.util.js';
import { ModoPauta } from '../recomendaciones/modo-pauta.enum.js';
import { TipoRecomendacion } from '../recomendaciones/tipo-recomendacion.enum.js';

const opcional = (max: number, etiqueta: string) =>
  [IsOptional(), Transform(limpiarTexto), IsString(), MaxLength(max, { message: `${etiqueta} no puede superar los ${max} caracteres` })];

function aplicar(...decoradores: (PropertyDecorator | PropertyDecorator[])[]): PropertyDecorator {
  return (t, k) => decoradores.flat().forEach((d) => d(t, k));
}

/** Datos de una plantilla de indicación. */
export class CrearPlantillaDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'El nombre es obligatorio' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  nombre: string;

  @IsEnum(TipoRecomendacion, { message: 'El tipo debe ser MEDICAMENTO, RUTINA, HABITO_EVITAR u OTRO' })
  tipo: TipoRecomendacion;

  @Transform(limpiarTexto)
  @IsString({ message: 'El título es obligatorio' })
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres' })
  @MaxLength(150, { message: 'El título no puede superar los 150 caracteres' })
  titulo: string;

  @Transform(limpiarTexto)
  @IsString({ message: 'Las indicaciones son obligatorias' })
  @MinLength(5, { message: 'Las indicaciones deben tener al menos 5 caracteres' })
  @MaxLength(2000, { message: 'Las indicaciones no pueden superar los 2000 caracteres' })
  descripcion: string;

  @aplicar(opcional(120, 'El medicamento'))
  medicamento?: string;

  @aplicar(opcional(80, 'La presentación'))
  presentacion?: string;

  @aplicar(opcional(80, 'La dosis'))
  dosis?: string;

  @aplicar(opcional(40, 'La vía'))
  via?: string;

  @IsOptional()
  @IsIn([ModoPauta.CADA_N_HORAS, ModoPauta.SEGUN_NECESIDAD], { message: 'La plantilla admite pauta «cada N horas» o «según necesidad»' })
  modo?: ModoPauta;

  @IsOptional()
  @IsInt({ message: 'El intervalo debe ser un número entero de horas' })
  @Min(1, { message: 'El intervalo mínimo es 1 hora' })
  @Max(72, { message: 'El intervalo máximo es 72 horas' })
  intervaloHoras?: number;

  @IsOptional()
  @IsInt({ message: 'La duración debe ser un número entero de días' })
  @Min(1, { message: 'La duración mínima es 1 día' })
  @Max(365, { message: 'La duración máxima es 365 días' })
  duracionDias?: number;
}

/** Cambios a una plantilla. */
export class EditarPlantillaDto extends CrearPlantillaDto {
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

/** Designa o retira a un director médico. */
export class DirectorDto {
  @IsBoolean({ message: 'Indique si es director médico' })
  esDirector: boolean;
}
