import { Component, effect, inject, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaLarga, fechaLocal, hoyIso, horaLocal, inicioSemana, sumarDias } from '../core/fechas';
import type { Cita, Pagina as PaginaDe, Profesional } from '../core/models';
import { AvisosStore } from '../shared/avisos.store';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, confirmar } from '../shared/piezas';

const ESTADOS: ReadonlyArray<{ valor: string; etiqueta: string }> = [
  { valor: 'RESERVADA', etiqueta: 'Reservadas' },
  { valor: 'EN_ESPERA', etiqueta: 'En espera' },
  { valor: 'EN_ATENCION', etiqueta: 'En atención' },
  { valor: 'ATENDIDA', etiqueta: 'Atendidas' },
  { valor: 'CANCELADA', etiqueta: 'Canceladas' },
  { valor: 'NO_ASISTIO', etiqueta: 'No asistieron' },
];

/**
 * Agenda general del centro para recepción: todas las citas del día o de la semana, con filtro por médico y estado. Desde aquí
 * se registra la llegada de los pacientes, y se cancelan, reprograman o marcan como inasistencia las citas.
 */
@Component({
  selector: 'app-agenda-recepcion',
  imports: [Pagina, Estado, ChipEstado, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatSelectModule, MatIconModule, MatPaginatorModule, RouterLink],
  template: `
    <app-pagina titulo="Agenda del centro" [subtitulo]="vista() === 'dia' ? mayus(fechaLarga(fecha())) : 'Semana del ' + fechaLarga(inicioSem())">
      <div acciones class="fila">
        <a mat-flat-button routerLink="../reservar"><mat-icon>add</mat-icon> Nueva cita</a>
      </div>
      <div class="fila filtros">
        <mat-button-toggle-group [value]="vista()" (change)="cambiarVista($event.value)" aria-label="Vista">
          <mat-button-toggle value="dia">Día</mat-button-toggle>
          <mat-button-toggle value="semana">Semana</mat-button-toggle>
        </mat-button-toggle-group>
        <button mat-icon-button type="button" (click)="mover(-1)" aria-label="Anterior"><mat-icon>chevron_left</mat-icon></button>
        <button mat-stroked-button type="button" (click)="fecha.set(hoy)">Hoy</button>
        <button mat-icon-button type="button" (click)="mover(1)" aria-label="Siguiente"><mat-icon>chevron_right</mat-icon></button>
        <mat-form-field class="filtro"><mat-label>Médico</mat-label>
          <mat-select [value]="medico()" (selectionChange)="medico.set($event.value)"><mat-option [value]="null">Todos</mat-option>@for (m of medicos(); track m.id) { <mat-option [value]="m.id">{{ m.nombre }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field class="filtro"><mat-label>Estado</mat-label>
          <mat-select [value]="estado()" (selectionChange)="estado.set($event.value)"><mat-option [value]="null">Todos</mat-option>@for (e of estados; track e.valor) { <mat-option [value]="e.valor">{{ e.etiqueta }}</mat-option> }</mat-select></mat-form-field>
      </div>

      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" mensaje="No hay citas con estos filtros." icono="event_available" (reintento)="cargar()">
        @for (g of grupos(); track g.fecha) {
          @if (vista() === 'semana') { <h2 class="seccion">{{ mayus(fechaLarga(g.fecha)) }}</h2> }
          <ul class="lista-tarjetas">
            @for (c of g.citas; track c.id) {
              <li class="item" [class.destacado]="c.estado === 'EN_ESPERA'">
                <span class="hora-grande">{{ hora(c.inicio) }}</span>
                <span class="grande">
                  <strong>{{ c.paciente.nombre }}</strong>
                  <small>RUT {{ c.paciente.rut }} · {{ c.medico.nombre }}{{ c.medico.especialidad ? ' (' + c.medico.especialidad + ')' : '' }}</small>
                  @if (c.llegadaEn) { <small>Llegó a las {{ hora(c.llegadaEn) }}</small> }
                  @if (c.motivoCancelacion) { <small>Motivo: {{ c.motivoCancelacion }}</small> }
                  @if (c.nota) { <small>Nota: {{ c.nota }}</small> }
                </span>
                <app-chip [estado]="c.estado" />
                <span class="acciones-fila">
                  <a mat-button [routerLink]="['../pacientes', c.paciente.id]">Paciente</a>
                  @if (c.estado === 'RESERVADA') {
                    <button mat-flat-button type="button" (click)="llegada(c)"><mat-icon>how_to_reg</mat-icon> Llegó</button>
                    <a mat-stroked-button [routerLink]="['../citas', c.id, 'reprogramar']">Reprogramar</a>
                    <button mat-button type="button" class="peligro" (click)="cancelar(c)">Cancelar</button>
                    @if (pasada(c)) { <button mat-button type="button" (click)="noAsistio(c)">No asistió</button> }
                  }
                  @if (c.estado === 'EN_ESPERA') { <button mat-button type="button" class="peligro" (click)="cancelar(c)">Cancelar</button> }
                </span>
              </li>
            }
          </ul>
        }
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="pagina($event)" />
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .filtros { margin-bottom: 1rem; align-items: center; } .filtro { width: 14rem; }
    .seccion { margin: 1.25rem 0 .5rem; } .item { flex-wrap: wrap; } .acciones-fila { margin-left: auto; flex-wrap: wrap; }
  `,
})
export class AgendaRecepcion {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly avisos = inject(AvisosStore);
  protected readonly hoy = hoyIso();
  protected readonly estados = ESTADOS;
  protected readonly vista = signal<'dia' | 'semana'>('dia');
  protected readonly fecha = signal(hoyIso());
  protected readonly medico = signal<number | null>(null);
  protected readonly estado = signal<string | null>(null);
  protected readonly medicos = signal<Profesional[]>([]);
  protected readonly lista = signal<PaginaDe<Cita>>({ items: [], total: 0, pagina: 1, tamano: 100 });
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly fechaLarga = fechaLarga;
  protected readonly hora = horaLocal;
  private n = 1;

  constructor() {
    this.api.get<Profesional[]>('/profesionales').subscribe({ next: (r) => this.medicos.set(r), error: () => undefined });
    effect(() => {
      this.vista();
      this.fecha();
      this.medico();
      this.estado();
      this.avisos.cambios();
      untracked(() => this.cargar(true));
    });
  }

  protected inicioSem(): string {
    return inicioSemana(this.fecha());
  }
  protected mayus(t: string): string {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  protected pasada(c: Cita): boolean {
    return new Date(c.fin).getTime() < Date.now();
  }
  protected cambiarVista(v: 'dia' | 'semana'): void {
    this.n = 1;
    this.vista.set(v);
  }
  protected mover(n: number): void {
    this.n = 1;
    this.fecha.set(sumarDias(this.fecha(), this.vista() === 'dia' ? n : 7 * n));
  }
  protected pagina(e: PageEvent): void {
    this.n = e.pageIndex + 1;
    this.cargar();
  }

  protected grupos(): Array<{ fecha: string; citas: Cita[] }> {
    const mapa = new Map<string, Cita[]>();
    for (const c of this.lista().items) {
      const f = fechaLocal(c.inicio);
      mapa.set(f, [...(mapa.get(f) ?? []), c]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, citas]) => ({ fecha, citas }));
  }

  protected cargar(silencioso = false): void {
    if (!silencioso) this.cargando.set(true);
    const rango = this.vista() === 'dia' ? { fecha: this.fecha() } : { desde: this.inicioSem(), hasta: sumarDias(this.inicioSem(), 6) };
    this.api.get<PaginaDe<Cita>>('/citas', { ...rango, medico: this.medico() ?? undefined, estado: this.estado() ?? undefined, pagina: this.n, tamano: 100 }).subscribe({
      next: (r) => {
        this.lista.set(r);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        if (!silencioso) this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  private accion(ruta: string, cuerpo: unknown, mensaje: string): void {
    this.api.post(ruta, cuerpo).subscribe({
      next: () => {
        this.snack.open(mensaje, 'Cerrar', { duration: 4000 });
        this.cargar(true);
      },
      error: (e: unknown) => {
        this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
        this.cargar(true);
      },
    });
  }

  protected llegada(c: Cita): void {
    this.accion(`/citas/${c.id}/llegada`, {}, `Llegada registrada: ${c.paciente.nombre}`);
  }

  protected async cancelar(c: Cita): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Cancelar la cita', texto: `${c.paciente.nombre} · ${this.hora(c.inicio)} con ${c.medico.nombre}. El paciente recibirá un aviso.`, motivo: 'Motivo de la cancelación', confirmar: 'Cancelar cita', peligro: true });
    if (r) this.accion(`/citas/${c.id}/cancelar`, { motivo: r.motivo }, 'Cita cancelada');
  }

  protected async noAsistio(c: Cita): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Marcar inasistencia', texto: `${c.paciente.nombre} no se presentó a su cita.`, confirmar: 'Marcar' });
    if (r) this.accion(`/citas/${c.id}/no-asistio`, {}, 'Inasistencia registrada');
  }
}
