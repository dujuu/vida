import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Parámetros de paginación comunes a todos los listados: `?pagina=1&tamano=20`. */
export class PaginacionDto {
  /** Número de página, desde 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser 1 o mayor' })
  pagina: number = 1;

  /** Cantidad de filas por página, entre 1 y 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño debe ser un número entero' })
  @Min(1, { message: 'El tamaño debe ser 1 o mayor' })
  @Max(100, { message: 'El tamaño no puede superar 100' })
  tamano: number = 20;
}

/** Respuesta paginada. */
export interface Pagina<T> {
  /** Filas de la página pedida. */
  items: T[];
  /** Total de filas que cumplen el filtro. */
  total: number;
  /** Página actual. */
  pagina: number;
  /** Tamaño de página. */
  tamano: number;
}

/** Arma una respuesta paginada. */
export function armarPagina<T>(items: T[], total: number, p: PaginacionDto): Pagina<T> {
  return { items, total, pagina: p.pagina, tamano: p.tamano };
}

/** Desplazamiento SQL para una página. */
export function desplazamiento(p: PaginacionDto): number {
  return (p.pagina - 1) * p.tamano;
}
