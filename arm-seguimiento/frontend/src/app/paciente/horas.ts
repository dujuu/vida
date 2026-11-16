import { Component, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { diaRelativo, fechaLarga, horaLocal } from '../core/fechas';
import type { Cita, Pagina as PaginaDe, Profesional } from '../core/models';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, confirmar } from '../shared/piezas';
import { SelectorHora, type HoraElegida } from '../shared/selector-hora';

/** «Mis horas»: próximas citas e historial, con cancelar y reprogramar según las políticas del centro. */
@Component({
  selector: 'app-horas',
  imports: [Pagina, Estado, ChipEstado, MatButtonModule, MatIconModule, MatButtonToggleModule, MatPaginatorModule, RouterLink],
  template: `
    <app-pagina titulo="Mis horas" subtitulo="Sus citas médicas">
      <a acciones mat-flat-button class="boton-grande" routerLink="reservar"><mat-icon>add</mat-icon> Reservar una hora</a>
      <mat-button-toggle-group [value]="filtro()" (change)="cambiarFiltro($event.value)" aria-label="Filtrar citas">
        <mat-button-toggle value="proximas">Próximas</mat-button-toggle>
        <mat-button-toggle value="historial">Historial</mat-button-toggle>
      </mat-button-toggle-group>
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" [mensaje]="filtro() === 'proximas' ? 'No tiene citas próximas. Puede reservar una hora.' : 'Todavía no tiene citas en su historial.'" icono="event_busy" (reintento)="cargar()">
        <ul class="lista-tarjetas lista">
          @for (c of lista().items; track c.id) {
            <li class="item">
              <div class="fecha"><strong>{{ dia(c.inicio) }}</strong><span class="hora-grande">{{ hora(c.inicio) }}</span></div>
              <div class="grande"><strong>{{ c.medico.nombre }}</strong><small>{{ c.medico.especialidad }}</small>
                @if (c.estado === 'CANCELADA' && c.motivoCancelacion) { <small>Motivo: {{ c.motivoCancelacion }}</small> }
              </div>
              <app-chip [estado]="c.estado" />
              @if (c.estado === 'RESERVADA' && filtro() === 'proximas') {
                <div class="acciones-fila">
                  <a mat-stroked-button [routerLink]="[c.id, 'reprogramar']">Cambiar hora</a>
                  <button mat-button type="button" class="peligro" (click)="cancelar(c)">Cancelar</button>
                </div>
              }
            </li>
          }
        </ul>
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="pagina($event)" />
      </app-estado>
    </app-pagina>
  `,
  styles: `.fecha { display: grid; min-width: 7.5rem; } .fecha > :first-child::first-letter { text-transform: uppercase; } .lista { margin: 1rem 0; } .item { flex-wrap: wrap; }`,
})
export class Horas {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly filtro = signal<'proximas' | 'historial'>('proximas');
  protected readonly lista = signal<PaginaDe<Cita>>({ items: [], total: 0, pagina: 1, tamano: 20 });
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly dia = diaRelativo;
  protected readonly hora = horaLocal;
  private n = 1;

  constructor() {
    effect(() => {
      this.filtro();
      this.n = 1;
      this.cargar();
    });
  }

  protected cambiarFiltro(v: 'proximas' | 'historial'): void {
    this.filtro.set(v);
  }

  protected pagina(e: PageEvent): void {
    this.n = e.pageIndex + 1;
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<PaginaDe<Cita>>('/citas/mias', { estado: this.filtro(), pagina: this.n, tamano: 20 }).subscribe({
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

  protected async cancelar(c: Cita): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Cancelar la cita', texto: `${diaRelativo(c.inicio)} a las ${horaLocal(c.inicio)} con ${c.medico.nombre}.`, motivo: 'Motivo de la cancelación', confirmar: 'Cancelar la cita', peligro: true });
    if (!r) return;
    this.api.post(`/citas/${c.id}/cancelar`, { motivo: r.motivo }).subscribe({
      next: () => {
        this.snack.open('Cita cancelada', 'Cerrar');
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }
}

/** Reservar una hora en tres pasos: especialidad, médico y día/hora. Si la hora se ocupó mientras tanto, avisa y recarga. */
@Component({
  selector: 'app-reservar',
  imports: [Pagina, Estado, SelectorHora, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Reservar una hora" [volver]="true" [subtitulo]="'Paso ' + paso() + ' de 3'">
      @switch (paso()) {
        @case (1) {
          <h2>¿Con qué especialidad?</h2>
          <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargarEspecialidades()">
            <div class="opciones">
              @for (e of especialidades(); track e.id) {
                <button class="opcion" type="button" (click)="elegirEspecialidad(e.id)"><mat-icon>medical_services</mat-icon>{{ e.nombre }}</button>
              }
            </div>
          </app-estado>
        }
        @case (2) {
          <h2>¿Con qué médico?</h2>
          <app-estado [cargando]="cargando()" [error]="error()" [vacio]="medicos().length === 0" mensaje="No hay médicos con reservas en línea en esta especialidad. Llame a recepción.">
            <ul class="lista-tarjetas">
              @for (m of medicos(); track m.id) {
                <li><button class="item opcion-fila" type="button" (click)="elegirMedico(m)" [disabled]="!m.aceptaReservas"><mat-icon>person</mat-icon><span class="grande"><strong>{{ m.nombre }}</strong><small>{{ m.presentacion || m.especialidad }}</small></span><mat-icon>chevron_right</mat-icon></button></li>
              }
            </ul>
          </app-estado>
          <button mat-button type="button" (click)="paso.set(1)">Cambiar especialidad</button>
        }
        @case (3) {
          <h2>{{ medico()?.nombre }}</h2>
          <p class="muted">Cada cita dura {{ medico()?.duracionCitaMin }} minutos. Elija un día marcado y luego la hora.</p>
          <app-selector-hora [medicoId]="medico()?.id ?? null" [elegida]="hora()" [recargar]="recarga()" (horaElegida)="hora.set($event)" />
          @if (hora(); as h) {
            <section class="tarjeta confirmar">
              <p>Confirma su hora con <strong>{{ medico()?.nombre }}</strong> el <strong>{{ fechaLarga(h.fecha) }}</strong> a las <strong>{{ h.hora }}</strong>.</p>
              @if (conflicto()) { <p class="aviso aviso-error" role="alert">{{ conflicto() }}</p> }
              <button mat-flat-button class="boton-grande" type="button" (click)="reservar()" [disabled]="enviando()">{{ enviando() ? 'Reservando…' : 'Confirmar la reserva' }}</button>
            </section>
          }
          <button mat-button type="button" (click)="paso.set(2)">Cambiar médico</button>
        }
      }
    </app-pagina>
  `,
  styles: `
    .opciones { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
    .opcion, .opcion-fila { display: flex; align-items: center; gap: .75rem; width: 100%; padding: 1rem; min-height: 64px; border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; background: var(--mat-sys-surface-container-lowest); color: inherit; font: inherit; cursor: pointer; text-align: left; }
    .opcion:hover, .opcion-fila:hover:not(:disabled) { border-color: var(--mat-sys-primary); background: var(--vn-suave); }
    .confirmar { margin: 1rem 0; display: grid; gap: .75rem; }
  `,
})
export class Reservar {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly paso = signal(1);
  protected readonly especialidades = signal<Array<{ id: number; nombre: string }>>([]);
  protected readonly medicos = signal<Profesional[]>([]);
  protected readonly medico = signal<Profesional | null>(null);
  protected readonly hora = signal<HoraElegida | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly conflicto = signal<string | null>(null);
  protected readonly recarga = signal(0);
  protected readonly fechaLarga = fechaLarga;

  constructor() {
    this.cargarEspecialidades();
  }

  protected cargarEspecialidades(): void {
    this.cargando.set(true);
    this.api.get<Array<{ id: number; nombre: string }>>('/especialidades').subscribe({
      next: (r) => {
        this.especialidades.set(r);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected elegirEspecialidad(id: number): void {
    this.cargando.set(true);
    this.paso.set(2);
    this.api.get<Profesional[]>('/profesionales', { especialidad: id }).subscribe({
      next: (r) => {
        this.medicos.set(r);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected elegirMedico(m: Profesional): void {
    this.medico.set(m);
    this.hora.set(null);
    this.conflicto.set(null);
    this.paso.set(3);
  }

  protected reservar(): void {
    const h = this.hora();
    const m = this.medico();
    if (!h || !m || this.enviando()) return;
    this.enviando.set(true);
    this.conflicto.set(null);
    this.api.post('/citas', { medicoId: m.id, inicio: h.inicio }).subscribe({
      next: () => {
        this.snack.open('Hora reservada', 'Cerrar');
        void this.router.navigateByUrl('/paciente/horas', { replaceUrl: true });
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.conflicto.set(mensajeError(e));
        this.hora.set(null);
        this.recarga.update((n) => n + 1); // la hora pudo ocuparse: se muestran las horas actualizadas
      },
    });
  }
}

/** Cambiar la hora de una cita con el mismo médico. Si la hora nueva ya no está, la cita original queda intacta. */
@Component({
  selector: 'app-reprogramar',
  imports: [Pagina, SelectorHora, MatButtonModule],
  template: `
    <app-pagina titulo="Cambiar la hora" [volver]="true" subtitulo="Su cita actual se mantiene hasta que confirme la hora nueva.">
      @if (cita(); as c) {
        <p>Cita actual: <strong>{{ dia(c.inicio) }} a las {{ hora(c.inicio) }}</strong> con {{ c.medico.nombre }}.</p>
        <app-selector-hora [medicoId]="c.medico.id" [elegida]="elegida()" [recargar]="recarga()" (horaElegida)="elegida.set($event)" />
        @if (elegida(); as h) {
          <section class="tarjeta confirmar">
            <p>Nueva hora: <strong>{{ fechaLarga(h.fecha) }} a las {{ h.hora }}</strong></p>
            @if (error()) { <p class="aviso aviso-error" role="alert">{{ error() }}</p> }
            <button mat-flat-button class="boton-grande" type="button" (click)="confirmar()" [disabled]="enviando()">Confirmar el cambio</button>
          </section>
        }
      }
    </app-pagina>
  `,
  styles: `.confirmar { margin: 1rem 0; display: grid; gap: .75rem; }`,
})
export class Reprogramar {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  /** Identificador de la cita, desde la ruta (`:id`). */
  readonly id = input.required<string>();
  protected readonly cita = signal<Cita | null>(null);
  protected readonly elegida = signal<HoraElegida | null>(null);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly recarga = signal(0);
  protected readonly dia = diaRelativo;
  protected readonly hora = horaLocal;
  protected readonly fechaLarga = fechaLarga;

  constructor() {
    effect(() => this.api.get<Cita>(`/citas/${this.id()}`).subscribe((c) => this.cita.set(c)));
  }

  protected confirmar(): void {
    const h = this.elegida();
    if (!h || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.api.post(`/citas/${this.id()}/reprogramar`, { inicio: h.inicio }).subscribe({
      next: () => {
        this.snack.open('Hora cambiada', 'Cerrar');
        void this.router.navigateByUrl('/paciente/horas', { replaceUrl: true });
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeError(e));
        this.elegida.set(null);
        this.recarga.update((n) => n + 1);
      },
    });
  }
}
