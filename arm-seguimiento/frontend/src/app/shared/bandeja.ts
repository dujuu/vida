import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { haceCuanto } from '../core/fechas';
import type { Aviso, Pagina as PaginaDe } from '../core/models';
import { AvisosStore } from './avisos.store';
import { Estado, Pagina } from './piezas';

/** Preferencias de aviso del usuario. */
interface Preferencias {
  avisosTomas: boolean;
  avisosCitas: boolean;
  silencioDesde: string | null;
  silencioHasta: string | null;
}

/** Bandeja de avisos y preferencias. La usan las cuatro áreas. */
@Component({
  selector: 'app-bandeja',
  imports: [Pagina, Estado, MatIconModule, MatButtonModule, MatPaginatorModule, MatSlideToggleModule, DatePipe],
  template: `
    <app-pagina titulo="Avisos" subtitulo="Lo que necesita saber, sin datos clínicos en el texto.">
      <button acciones mat-stroked-button type="button" (click)="leerTodas()" [disabled]="sinLeer() === 0"><mat-icon>done_all</mat-icon> Marcar todo como leído</button>

      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" mensaje="No tiene avisos." icono="notifications_off" (reintento)="cargar()">
        <ul class="lista">
          @for (a of lista().items; track a.id) {
            <li [class.nuevo]="!a.leidaEn">
              <button type="button" class="aviso-item" (click)="abrir(a)">
                <mat-icon>{{ a.leidaEn ? 'notifications' : 'notifications_active' }}</mat-icon>
                <span class="textos"><strong>{{ a.titulo }}</strong><span>{{ a.texto }}</span><small>{{ haceCuanto(a.createdAt) }}, {{ a.createdAt | date: 'HH:mm' }}</small></span>
              </button>
            </li>
          }
        </ul>
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="cambiarPagina($event)" />
      </app-estado>

      @if (prefs(); as p) {
        <section class="tarjeta preferencias">
          <h2>Preferencias de aviso</h2>
          <mat-slide-toggle [checked]="p.avisosCitas" (change)="guardar({ avisosCitas: $event.checked })">Avisos de citas</mat-slide-toggle>
          <mat-slide-toggle [checked]="p.avisosTomas" (change)="guardar({ avisosTomas: $event.checked })">Alertas de tomas mientras la aplicación está abierta</mat-slide-toggle>
          <p class="muted">Con la aplicación cerrada no se envían avisos: el navegador no lo permite sin conexión segura.</p>
        </section>
      }
    </app-pagina>
  `,
  styles: `
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
    .lista li { border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; background: var(--mat-sys-surface-container-lowest); }
    .lista li.nuevo { border-color: var(--mat-sys-primary); background: var(--vn-suave); }
    .aviso-item { display: flex; gap: .75rem; width: 100%; text-align: left; background: none; border: 0; padding: .85rem 1rem; color: inherit; font: inherit; cursor: pointer; align-items: flex-start; }
    .textos { display: grid; gap: .15rem; } small { color: var(--mat-sys-on-surface-variant); }
    .preferencias { display: grid; gap: .75rem; margin-top: 1.5rem; }
  `,
})
export class Bandeja {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly store = inject(AvisosStore);
  protected readonly lista = signal<PaginaDe<Aviso>>({ items: [], total: 0, pagina: 1, tamano: 20 });
  protected readonly prefs = signal<Preferencias | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sinLeer = computed(() => this.store.resumen().sinLeer);
  protected readonly haceCuanto = haceCuanto;
  private pagina = 1;

  constructor() {
    effect(() => {
      this.store.cambios();
      this.cargar();
    });
    this.api.get<Preferencias>('/notificaciones/preferencias').subscribe((p) => this.prefs.set(p));
  }

  protected cargar(): void {
    this.api.get<PaginaDe<Aviso>>('/notificaciones', { pagina: this.pagina, tamano: 20 }).subscribe({
      next: (r) => {
        this.lista.set(r);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected cambiarPagina(e: PageEvent): void {
    this.pagina = e.pageIndex + 1;
    this.cargar();
  }

  protected abrir(a: Aviso): void {
    this.api.post(`/notificaciones/${a.id}/leida`).subscribe(() => {
      void this.store.cargar();
      if (a.enlace) void this.router.navigateByUrl(a.enlace);
      else this.cargar();
    });
  }

  protected leerTodas(): void {
    this.api.post('/notificaciones/leer-todas').subscribe(() => {
      void this.store.cargar();
      this.cargar();
    });
  }

  protected guardar(cambios: Partial<Preferencias>): void {
    this.api.put<Preferencias>('/notificaciones/preferencias', cambios).subscribe((p) => this.prefs.set(p));
  }
}
