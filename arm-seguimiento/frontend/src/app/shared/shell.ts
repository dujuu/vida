import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, DestroyRef, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { AREA_DE_ROL, ETIQUETA_ROL, ICONO_ROL } from '../core/models';
import { AvisosStore } from './avisos.store';
import { CambiarPassword } from './cambiar-password';
import { Logo } from './logo';

/** Entrada del menú de navegación de un área. */
export interface EntradaNav {
  ruta: string;
  etiqueta: string;
  icono: string;
  /** Muestra la cantidad de avisos sin leer. */
  avisos?: boolean;
}

/**
 * Estructura común de las cuatro áreas (paciente, médico, recepción y administración): barra superior con el
 * usuario, el menú de perfil y la campana de avisos, y un menú de navegación que se adapta al ancho. En teléfono es una
 * barra inferior; desde 900 px es un menú lateral. Las entradas del menú vienen de `data.nav` de la ruta del área.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, MatMenuModule, MatBadgeModule, Logo],
  template: `
    <header class="barra">
      <a class="marca" [routerLink]="base" aria-label="Ir al inicio">
        <app-logo class="isotipo" [marca]="true" />
        <span class="nombre">Vida <strong>Norte</strong></span>
      </a>
      <span class="area">{{ area }}</span>
      <span class="espacio"></span>
      <a mat-icon-button [routerLink]="base + '/notificaciones'" aria-label="Avisos" class="campana">
        <mat-icon [matBadge]="avisos.resumen().sinLeer" [matBadgeHidden]="avisos.resumen().sinLeer === 0" matBadgeSize="small" matBadgeColor="warn">notifications</mat-icon>
      </a>
      <button mat-button type="button" [matMenuTriggerFor]="menu" class="persona" aria-label="Menú de la cuenta">
        <mat-icon>account_circle</mat-icon>
        <span class="quien">{{ usuario()?.nombre }}</span>
        <mat-icon>arrow_drop_down</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        <div class="cabecera-menu" role="presentation">
          <strong>{{ usuario()?.nombre }}</strong>
          <span>{{ usuario()?.rut }} · {{ rolActivo() }}</span>
        </div>
        @if ((usuario()?.roles?.length ?? 0) > 1) {
          <button mat-menu-item type="button" (click)="cambiarPerfil()"><mat-icon>swap_horiz</mat-icon><span>Cambiar de perfil</span></button>
        }
        <button mat-menu-item type="button" (click)="cambiarClave()"><mat-icon>key</mat-icon><span>Cambiar contraseña</span></button>
        <button mat-menu-item type="button" (click)="auth.logout()"><mat-icon>logout</mat-icon><span>Cerrar sesión</span></button>
      </mat-menu>
    </header>

    <div class="cuerpo">
      <nav class="nav" aria-label="Principal">
        @for (n of nav; track n.ruta) {
          <a [routerLink]="n.ruta" routerLinkActive="activo" [attr.aria-label]="n.etiqueta">
            <mat-icon [matBadge]="n.avisos ? avisos.resumen().sinLeer : 0" [matBadgeHidden]="!n.avisos || avisos.resumen().sinLeer === 0" matBadgeSize="small" matBadgeColor="warn">{{ n.icono }}</mat-icon>
            <span>{{ n.etiqueta }}</span>
          </a>
        }
      </nav>
      <main class="contenido" id="contenido"><router-outlet /></main>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100vh; }
    .barra { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: .5rem; padding: .4rem .75rem; background: var(--mat-sys-surface-container-lowest); border-bottom: 1px solid var(--mat-sys-outline-variant); min-height: 56px; }
    .marca { display: flex; align-items: center; gap: .5rem; text-decoration: none; color: var(--vn-tinta); }
    .isotipo { width: 34px; }
    .nombre { font: var(--mat-sys-title-medium); }
    .area { margin-left: .5rem; padding: .15rem .6rem; border-radius: 999px; background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); font: var(--mat-sys-label-medium); }
    .espacio { flex: 1; }
    .persona .quien { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cabecera-menu { display: flex; flex-direction: column; padding: .5rem 1rem .75rem; border-bottom: 1px solid var(--mat-sys-outline-variant); font: var(--mat-sys-body-medium); }
    .cabecera-menu span { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .contenido { padding: 1rem 1rem 6rem; max-width: 1200px; margin-inline: auto; }
    .nav { position: fixed; inset: auto 0 0 0; z-index: 20; display: flex; background: var(--mat-sys-surface-container); border-top: 1px solid var(--mat-sys-outline-variant); padding-bottom: env(safe-area-inset-bottom); }
    .nav a { flex: 1; display: flex; flex-direction: column; align-items: center; gap: .1rem; padding: .5rem .25rem; min-height: 56px; text-decoration: none; color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-label-medium); }
    .nav a.activo { color: var(--vn-tinta); font-weight: 700; }
    .nav a.activo mat-icon { background: var(--mat-sys-secondary-container); border-radius: 999px; width: 56px; height: 28px; display: grid; place-items: center; }
    @media (max-width: 599px) { .area, .persona .quien { display: none; } .nombre { display: none; } }
    @media (min-width: 900px) {
      .cuerpo { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100vh - 56px); }
      .nav { position: sticky; top: 56px; inset: auto; align-self: start; flex-direction: column; height: calc(100vh - 56px); padding: 1rem .5rem; border-top: 0; border-right: 1px solid var(--mat-sys-outline-variant); background: var(--mat-sys-surface-container-low); }
      .nav a { flex: none; flex-direction: row; gap: .75rem; padding: .65rem 1rem; border-radius: 999px; font: var(--mat-sys-label-large); }
      .nav a.activo { background: var(--mat-sys-secondary-container); }
      .nav a.activo mat-icon { background: none; width: auto; height: auto; }
      .contenido { padding: 1.5rem 2rem 2rem; width: 100%; }
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly avisos = inject(AvisosStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly nav: EntradaNav[] = this.ruta.snapshot.data['nav'] ?? [];
  protected readonly area: string = this.ruta.snapshot.data['area'] ?? '';
  protected readonly usuario = this.auth.usuario;
  protected readonly rolActivo = computed(() => (this.usuario()?.rol ? ETIQUETA_ROL[this.usuario()!.rol!] : ''));
  protected readonly base = AREA_DE_ROL[this.auth.usuario()?.rol ?? 'PACIENTE'];
  protected readonly icono = ICONO_ROL;
  /** Se mantiene para que el diseño reaccione al ancho si hiciera falta. */
  protected readonly ancho = toSignal(inject(BreakpointObserver).observe('(min-width: 900px)').pipe(map((r) => r.matches)), { initialValue: false });

  constructor() {
    this.avisos.iniciar(inject(DestroyRef));
  }

  protected cambiarPerfil(): void {
    void this.router.navigateByUrl('/perfil');
  }

  protected cambiarClave(): void {
    this.dialog.open(CambiarPassword, { width: '420px', maxWidth: '95vw' });
  }
}
