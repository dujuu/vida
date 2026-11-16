import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, tap, type Observable } from 'rxjs';
import { AREA_DE_ROL, type LoginRespuesta, type Rol, type Usuario } from './models';

/**
 * Sesión del usuario.
 *
 * El token de acceso (de 15 minutos) vive solo en memoria: no se guarda en `localStorage` ni `sessionStorage`, de modo
 * que un script ajeno no puede leerlo. La sesión se mantiene con una cookie `httpOnly` de renovación que el servidor
 * rota en cada uso; al abrir la aplicación o recargar la página, `iniciar()` la usa para recuperar la sesión.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _usuario = signal<Usuario | null>(null);
  private _token: string | null = null;
  private inicio: Promise<void> | null = null;
  private renovando: Promise<boolean> | null = null;

  /** Usuario con sesión abierta, o `null`. */
  readonly usuario = this._usuario.asReadonly();

  /** Token de acceso actual. */
  token(): string | null {
    return this._token;
  }

  /** Intenta recuperar la sesión con la cookie de renovación. Se llama una sola vez al arrancar la aplicación. */
  iniciar(): Promise<void> {
    this.inicio ??= this.renovar().then(() => undefined);
    return this.inicio;
  }

  private aplicar(r: LoginRespuesta): Usuario {
    this._token = r.accessToken;
    this._usuario.set(r.usuario);
    return r.usuario;
  }

  /** Inicia sesión con RUT y contraseña. */
  login(rut: string, password: string, claveUnicaSimulada = false): Observable<LoginRespuesta> {
    const ruta = claveUnicaSimulada ? '/api/auth/clave-unica-simulada' : '/api/auth/login';
    return this.http.post<LoginRespuesta>(ruta, { rut, password }).pipe(tap((r) => this.aplicar(r)));
  }

  /** Activa una cuenta (o recupera el acceso) con un código de un solo uso. */
  activar(datos: { rut: string; codigo: string; password: string; aceptaConsentimiento?: boolean }): Observable<LoginRespuesta> {
    return this.http.post<LoginRespuesta>('/api/auth/activar', datos).pipe(tap((r) => this.aplicar(r)));
  }

  /** Elige con qué rol se actúa en esta sesión. */
  elegirRol(rol: Rol): Observable<LoginRespuesta> {
    return this.http.post<LoginRespuesta>('/api/auth/rol', { rol }).pipe(tap((r) => this.aplicar(r)));
  }

  /**
   * Renueva el token de acceso con la cookie de renovación. Si varias peticiones fallan a la vez por token vencido,
   * comparten una sola renovación. Devuelve `false` si la sesión ya no es válida.
   */
  renovar(): Promise<boolean> {
    this.renovando ??= firstValueFrom(this.http.post<LoginRespuesta>('/api/auth/renovar', {}))
      .then((r) => {
        this.aplicar(r);
        return true;
      })
      .catch(() => {
        this._token = null;
        this._usuario.set(null);
        return false;
      })
      .finally(() => {
        this.renovando = null;
      });
    return this.renovando;
  }

  /** Cierra la sesión en el servidor (la revoca) y vuelve al inicio de sesión. */
  logout(): void {
    void firstValueFrom(this.http.post('/api/auth/logout', {})).catch(() => undefined);
    this.cerrarLocal();
  }

  /** Borra la sesión de este navegador y lleva al inicio de sesión. */
  cerrarLocal(): void {
    this._token = null;
    this._usuario.set(null);
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /** Pantalla de inicio de un rol, o la elección de perfil si todavía no tiene rol activo. */
  rutaInicio(rol: Rol | null): string {
    return rol ? AREA_DE_ROL[rol] : '/perfil';
  }

  /** Marca que ya no debe cambiar la contraseña (después de cambiarla). */
  contrasenaCambiada(): void {
    const u = this._usuario();
    if (u) this._usuario.set({ ...u, debeCambiarPassword: false });
  }
}
