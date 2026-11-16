import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

/** Convierte un objeto en parámetros de URL, omitiendo los vacíos. */
export function aParametros(valores?: Record<string, unknown>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(valores ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
}

/**
 * Cliente de la API. Todas las rutas se escriben sin el prefijo `/api` (por ejemplo `/citas/mias`). El token lo
 * agrega el interceptor de autenticación.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(ruta: string, params?: Record<string, unknown>): Observable<T> {
    return this.http.get<T>(`/api${ruta}`, { params: aParametros(params) });
  }

  post<T>(ruta: string, cuerpo: unknown = {}): Observable<T> {
    return this.http.post<T>(`/api${ruta}`, cuerpo);
  }

  put<T>(ruta: string, cuerpo: unknown = {}): Observable<T> {
    return this.http.put<T>(`/api${ruta}`, cuerpo);
  }

  patch<T>(ruta: string, cuerpo: unknown = {}): Observable<T> {
    return this.http.patch<T>(`/api${ruta}`, cuerpo);
  }

  delete<T = void>(ruta: string): Observable<T> {
    return this.http.delete<T>(`/api${ruta}`);
  }

  /** Descarga un archivo protegido como contenido binario. */
  descargar(ruta: string): Observable<Blob> {
    return this.http.get(`/api${ruta}`, { responseType: 'blob' });
  }

  /** Sube un archivo (formulario multipart). */
  subir<T>(ruta: string, archivo: File, campos: Record<string, string | number | undefined> = {}): Observable<T> {
    const f = new FormData();
    f.append('archivo', archivo);
    for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== '') f.append(k, String(v));
    return this.http.post<T>(`/api${ruta}`, f);
  }
}
