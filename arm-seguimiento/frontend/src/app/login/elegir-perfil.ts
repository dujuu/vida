import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { ETIQUETA_ROL, ICONO_ROL, type Rol } from '../core/models';
import { Logo } from '../shared/logo';

/** Textos de ayuda de cada perfil. */
const AYUDA: Record<Rol, string> = {
  PACIENTE: 'Sus horas, indicaciones y calendario de tratamientos',
  MEDICO: 'Agenda, pacientes y ficha clínica',
  RECEPCIONISTA: 'Agenda del centro, registro de pacientes y contactos',
  ADMINISTRADOR: 'Usuarios, profesionales, auditoría y parámetros',
};

/**
 * Elección de perfil para quien tiene más de un rol. La sesión actúa con un solo rol a la vez; se puede cambiar desde
 * el menú de la cuenta sin volver a escribir la contraseña.
 */
@Component({
  selector: 'app-elegir-perfil',
  imports: [MatIconModule, Logo],
  template: `
    <main class="pagina">
      <section class="acceso" aria-labelledby="t">
        <app-logo class="logo" />
        <h1 id="t">¿Con qué perfil quiere entrar?</h1>
        <p class="muted">Hola, {{ usuario()?.nombre }}. Tiene más de un perfil.</p>
        <ul class="perfiles">
          @for (r of usuario()?.roles ?? []; track r) {
            <li>
              <button type="button" class="perfil" (click)="elegir(r)" [disabled]="cargando()">
                <mat-icon>{{ iconos[r] }}</mat-icon>
                <span><strong>{{ etiquetas[r] }}</strong><small>{{ ayuda[r] }}</small></span>
              </button>
            </li>
          }
        </ul>
        @if (error()) { <p class="aviso aviso-error" role="alert">{{ error() }}</p> }
        <button class="salir" type="button" (click)="auth.logout()">Cerrar sesión</button>
      </section>
    </main>
  `,
  styleUrl: './login.css',
  styles: `
    .perfiles { list-style: none; padding: 0; margin: 1.25rem 0 0; display: grid; gap: .75rem; }
    .perfil { display: flex; align-items: center; gap: 1rem; width: 100%; padding: 1rem; text-align: left; border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; background: var(--mat-sys-surface-container-lowest); color: inherit; font: inherit; cursor: pointer; min-height: 72px; }
    .perfil:hover:not(:disabled) { border-color: var(--mat-sys-primary); background: var(--vn-suave); }
    .perfil span { display: grid; gap: .15rem; } .perfil small { color: var(--mat-sys-on-surface-variant); }
    .perfil mat-icon { font-size: 2rem; width: 2rem; height: 2rem; color: var(--vn-tinta); }
    .salir { margin-top: 1.25rem; background: none; border: 0; color: var(--vn-tinta); font: inherit; text-decoration: underline; cursor: pointer; }
  `,
})
export class ElegirPerfil {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly usuario = this.auth.usuario;
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly etiquetas = ETIQUETA_ROL;
  protected readonly iconos = ICONO_ROL;
  protected readonly ayuda = AYUDA;

  constructor() {
    const u = this.auth.usuario();
    if (u?.rol) void this.router.navigateByUrl(this.auth.rutaInicio(u.rol), { replaceUrl: true });
  }

  protected elegir(rol: Rol): void {
    this.cargando.set(true);
    this.error.set(null);
    this.auth.elegirRol(rol).subscribe({
      next: (r) => void this.router.navigateByUrl(this.auth.rutaInicio(r.usuario.rol), { replaceUrl: true }),
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}
