import { Component, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaCorta, fechaHora, haceCuanto } from '../core/fechas';
import { ICONO_TIPO, etiquetaTipo, type Indicacion, type Pagina as PaginaDe, type TipoRecomendacion } from '../core/models';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina } from '../shared/piezas';

/** Indicaciones que el paciente recibió de cualquiera de sus médicos: vigentes y anteriores, con el médico que las emitió. */
@Component({
  selector: 'app-indicaciones',
  imports: [Pagina, Estado, ChipEstado, MatIconModule, MatButtonToggleModule, MatPaginatorModule, RouterLink],
  template: `
    <app-pagina titulo="Mis indicaciones" subtitulo="Lo que sus médicos le indicaron">
      <mat-button-toggle-group [value]="ver()" (change)="ver.set($event.value)" aria-label="Filtrar indicaciones">
        <mat-button-toggle value="vigentes">Vigentes</mat-button-toggle>
        <mat-button-toggle value="anteriores">Anteriores</mat-button-toggle>
      </mat-button-toggle-group>
      @if (sinLeer() > 0) { <p class="aviso aviso-info" role="status"><mat-icon>mark_email_unread</mat-icon>{{ sinLeer() === 1 ? 'Tiene 1 indicación sin leer.' : 'Tiene ' + sinLeer() + ' indicaciones sin leer.' }}</p> }
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" [mensaje]="ver() === 'vigentes' ? 'No tiene indicaciones vigentes.' : 'No tiene indicaciones anteriores.'" icono="sticky_note_2" (reintento)="cargar()">
        <ul class="lista-tarjetas lista">
          @for (i of lista().items; track i.id) {
            <li>
              <a class="item" [class.destacado]="!i.leidaAt" [routerLink]="[i.id]">
                <mat-icon>{{ icono(i.tipo) }}</mat-icon>
                <span class="grande">
                  <strong>{{ i.titulo }}</strong>
                  <small>{{ etiqueta(i.tipo) }} · {{ i.doctor.nombre }} · {{ haceCuanto(i.createdAt) }}</small>
                  @if (i.fechaInicio) { <small>Vigencia: {{ fecha(i.fechaInicio) }}{{ i.fechaFin ? ' al ' + fecha(i.fechaFin) : '' }}</small> }
                </span>
                @if (!i.leidaAt) { <app-chip etiqueta="Sin leer" color="aviso" /> }
                <app-chip [estado]="i.estado" />
              </a>
            </li>
          }
        </ul>
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="pagina($event)" />
      </app-estado>
    </app-pagina>
  `,
  styles: `a.item { text-decoration: none; color: inherit; flex-wrap: wrap; } .lista { margin: 1rem 0; } .aviso-info { background: var(--vn-suave); color: var(--mat-sys-on-primary-container); margin-top: 1rem; }`,
})
export class Indicaciones {
  private readonly api = inject(Api);
  /** Filtro inicial desde la dirección (`?ver=anteriores`). */
  readonly verInicial = input<string>('vigentes', { alias: 'ver' });
  protected readonly ver = signal<'vigentes' | 'anteriores'>('vigentes');
  protected readonly lista = signal<PaginaDe<Indicacion>>({ items: [], total: 0, pagina: 1, tamano: 20 });
  protected readonly sinLeer = signal(0);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly icono = (t: string) => ICONO_TIPO[t as TipoRecomendacion] ?? 'sticky_note_2';
  protected readonly etiqueta = etiquetaTipo;
  protected readonly fecha = fechaCorta;
  protected readonly haceCuanto = haceCuanto;
  private n = 1;

  constructor() {
    effect(() => {
      if (this.verInicial() === 'anteriores') this.ver.set('anteriores');
    });
    effect(() => {
      this.ver();
      this.n = 1;
      this.cargar();
    });
  }

  protected pagina(e: PageEvent): void {
    this.n = e.pageIndex + 1;
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<PaginaDe<Indicacion>>('/recomendaciones/mias', { estado: this.ver(), pagina: this.n, tamano: 20 }).subscribe({
      next: (r) => {
        this.lista.set(r);
        this.sinLeer.set(r.items.filter((i) => !i.leidaAt).length);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}

interface Detalle extends Indicacion {
  pautaVigente: { modo: string; intervaloHoras: number | null; horasLocales: string[] | null; inicioLocal: string; duracionDias: number; diasSemana: number[] | null } | null;
  tomas: { programadas: number; realizadas: number; omitidas: number; sinRegistro: number; futuras: number; anuladas: number };
  aviso: string;
}

/** Detalle de una indicación: quién la emitió, cuándo, su vigencia, la pauta y el aviso de que no reemplaza una receta. */
@Component({
  selector: 'app-indicacion-detalle',
  imports: [Pagina, Estado, ChipEstado, MatButtonModule, MatIconModule],
  template: `
    <app-pagina [titulo]="d()?.titulo ?? 'Indicación'" [volver]="true">
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (d(); as i) {
          <section class="tarjeta columna">
            <div class="fila"><app-chip [estado]="i.estado" /> <span class="muted">{{ etiqueta(i.tipo) }}</span></div>
            <p class="texto">{{ i.descripcion }}</p>
            @if (i.medicamento) {
              <div class="datos">
                <div><small>Medicamento</small><strong>{{ i.medicamento }}</strong></div>
                @if (i.presentacion) { <div><small>Presentación</small><strong>{{ i.presentacion }}</strong></div> }
                <div><small>Dosis</small><strong>{{ i.dosis }}</strong></div>
                <div><small>Vía</small><strong>{{ i.via }}</strong></div>
              </div>
            }
            @if (i.pautaVigente; as p) {
              <p><mat-icon>schedule</mat-icon>
                @switch (p.modo) {
                  @case ('CADA_N_HORAS') { Cada {{ p.intervaloHoras }} horas, durante {{ p.duracionDias }} días, desde el {{ p.inicioLocal }}. }
                  @case ('HORAS_FIJAS') { A las {{ p.horasLocales?.join(', ') }}, durante {{ p.duracionDias }} días, desde el {{ p.inicioLocal }}. }
                  @default { Según necesidad. }
                }
              </p>
              @if (i.tomas.programadas > 0) { <p class="muted">Tomas programadas: {{ i.tomas.programadas - i.tomas.anuladas }} · marcadas como tomadas: {{ i.tomas.realizadas }}.</p> }
            }
            <p class="muted">Emitida por {{ i.doctor.nombre }}{{ i.doctor.especialidad ? ' (' + i.doctor.especialidad + ')' : '' }} el {{ hora(i.createdAt) }}. @if (i.fechaInicio) { Vigencia: {{ fecha(i.fechaInicio) }}{{ i.fechaFin ? ' al ' + fecha(i.fechaFin) : '' }}. } @if (i.version > 1) { Versión {{ i.version }}. }</p>
            @if (i.motivoSuspension) { <p class="aviso aviso-error"><mat-icon>pause_circle</mat-icon>Suspendida: {{ i.motivoSuspension }}</p> }
            <p class="muted"><mat-icon>info</mat-icon> {{ i.aviso }}</p>
            @if (!i.leidaAt) { <button mat-flat-button class="boton-grande" type="button" (click)="leer()"><mat-icon>done</mat-icon> Marcar como leída</button> }
            @else { <p class="muted"><mat-icon>done_all</mat-icon> Leída el {{ hora(i.leidaAt) }}</p> }
          </section>
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .texto { font-size: 1.1rem; white-space: pre-line; }
    .datos { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; padding: .75rem; background: var(--mat-sys-surface-container); border-radius: 12px; }
    .datos div { display: grid; } .datos small { color: var(--mat-sys-on-surface-variant); }
    mat-icon { vertical-align: middle; margin-right: .25rem; }
  `,
})
export class IndicacionDetalle {
  private readonly api = inject(Api);
  private readonly snack = inject(MatSnackBar);
  /** Identificador desde la ruta. */
  readonly id = input.required<string>();
  protected readonly d = signal<Detalle | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly etiqueta = etiquetaTipo;
  protected readonly hora = fechaHora;
  protected readonly fecha = fechaCorta;

  constructor() {
    effect(() => {
      this.id();
      this.cargar();
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<Detalle>(`/recomendaciones/${this.id()}`).subscribe({
      next: (r) => {
        this.d.set(r);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected leer(): void {
    this.api.patch(`/recomendaciones/${this.id()}/leida`).subscribe({
      next: () => {
        this.snack.open('Marcada como leída', 'Cerrar');
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar'),
    });
  }
}
