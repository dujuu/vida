import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaLarga, fechaLocal, hoyIso, horaLocal, inicioSemana, sumarDias } from '../core/fechas';
import type { Cita } from '../core/models';
import { AvisosStore } from '../shared/avisos.store';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, confirmar } from '../shared/piezas';

/**
 * Agenda del médico: las citas del día con la sala de espera arriba (los pacientes que ya llegaron), o la semana completa.
 * Desde cada cita se inicia la atención, se abre la ficha, se registra la atención y se cierra la cita.
 */
@Component({
  selector: 'app-agenda-medico',
  imports: [Pagina, Estado, ChipEstado, MatButtonModule, MatButtonToggleModule, MatIconModule, RouterLink, NgTemplateOutlet],
  template: `
    <app-pagina titulo="Mi agenda" [subtitulo]="vista() === 'dia' ? mayus(fechaLarga(fecha())) : 'Semana del ' + fechaLarga(inicioSem())">
      <div acciones class="fila">
        <mat-button-toggle-group [value]="vista()" (change)="vista.set($event.value)" aria-label="Vista">
          <mat-button-toggle value="dia">Día</mat-button-toggle>
          <mat-button-toggle value="semana">Semana</mat-button-toggle>
        </mat-button-toggle-group>
        <button mat-icon-button type="button" (click)="mover(-1)" aria-label="Anterior"><mat-icon>chevron_left</mat-icon></button>
        <button mat-stroked-button type="button" (click)="fecha.set(hoy)">Hoy</button>
        <button mat-icon-button type="button" (click)="mover(1)" aria-label="Siguiente"><mat-icon>chevron_right</mat-icon></button>
      </div>

      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="citas().length === 0" mensaje="No hay citas en este período." icono="event_available" (reintento)="cargar()">
        @if (vista() === 'dia') {
          @if (enEspera().length > 0) {
            <h2 class="seccion"><mat-icon>hourglass_top</mat-icon> En sala de espera ({{ enEspera().length }})</h2>
            <ul class="lista-tarjetas">@for (c of enEspera(); track c.id) { <li><ng-container *ngTemplateOutlet="fila; context: { c: c }" /></li> }</ul>
          }
          <h2 class="seccion">Citas del día</h2>
        }
        @for (g of grupos(); track g.fecha) {
          @if (vista() === 'semana') { <h2 class="seccion">{{ mayus(fechaLarga(g.fecha)) }}</h2> }
          <ul class="lista-tarjetas">
            @for (c of g.citas; track c.id) { <li><ng-container *ngTemplateOutlet="fila; context: { c: c }" /></li> }
          </ul>
        }
      </app-estado>
    </app-pagina>

    <ng-template #fila let-c="c">
      <div class="item" [class.destacado]="c.estado === 'EN_ESPERA'" [class.atencion]="c.estado === 'EN_ATENCION'">
        <span class="hora-grande">{{ hora(c.inicio) }}</span>
        <span class="grande"><strong>{{ c.paciente.nombre }}</strong><small>RUT {{ c.paciente.rut }} · {{ tipo(c.tipo) }}</small>
          @if (c.llegadaEn) { <small>Llegó a las {{ hora(c.llegadaEn) }}</small> }
          @if (c.atencion) { <small>Atención: {{ c.atencion.estado === 'CERRADA' ? 'cerrada' : 'borrador' }}</small> }
        </span>
        <app-chip [estado]="c.estado" />
        <span class="acciones-fila">
          <a mat-stroked-button [routerLink]="['../pacientes', c.paciente.id]"><mat-icon>folder_shared</mat-icon> Ficha</a>
          @if (c.estado === 'RESERVADA' || c.estado === 'EN_ESPERA') { <button mat-flat-button type="button" (click)="atender(c)"><mat-icon>play_arrow</mat-icon> Atender</button> }
          @if (c.estado === 'EN_ATENCION') {
            <button mat-flat-button type="button" (click)="atender(c)"><mat-icon>edit_note</mat-icon> {{ c.atencion ? 'Continuar atención' : 'Registrar atención' }}</button>
            <button mat-stroked-button type="button" (click)="finalizar(c)">Finalizar cita</button>
          }
          @if (c.estado === 'RESERVADA' && pasada(c)) { <button mat-button type="button" class="peligro" (click)="noAsistio(c)">No asistió</button> }
        </span>
      </div>
    </ng-template>
  `,
  styles: `
    .seccion { margin: 1.25rem 0 .5rem; display: flex; align-items: center; gap: .5rem; }
    .item { flex-wrap: wrap; } .item.atencion { border-color: var(--mat-sys-primary); }
    .acciones-fila { margin-left: auto; }
  `,
})
export class AgendaMedico {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly avisos = inject(AvisosStore);
  protected readonly hoy = hoyIso();
  protected readonly vista = signal<'dia' | 'semana'>('dia');
  protected readonly fecha = signal(hoyIso());
  protected readonly citas = signal<Cita[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly fechaLarga = fechaLarga;
  protected readonly hora = horaLocal;

  constructor() {
    effect(() => {
      this.vista();
      this.fecha();
      this.avisos.cambios();
      this.cargar(true);
    });
  }

  protected inicioSem(): string {
    return inicioSemana(this.fecha());
  }

  protected mayus(t: string): string {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  protected tipo(t: string): string {
    return ({ PRIMERA_VEZ: 'Primera vez', CONTROL: 'Control', EXAMEN: 'Examen', OTRO: 'Otro' } as Record<string, string>)[t] ?? t;
  }

  protected enEspera(): Cita[] {
    return this.citas().filter((c) => c.estado === 'EN_ESPERA').sort((a, b) => (a.llegadaEn ?? '').localeCompare(b.llegadaEn ?? ''));
  }

  protected grupos(): Array<{ fecha: string; citas: Cita[] }> {
    const mapa = new Map<string, Cita[]>();
    for (const c of this.citas()) {
      if (this.vista() === 'dia' && c.estado === 'EN_ESPERA') continue;
      const f = fechaLocal(c.inicio);
      mapa.set(f, [...(mapa.get(f) ?? []), c]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, citas]) => ({ fecha, citas }));
  }

  protected pasada(c: Cita): boolean {
    return new Date(c.inicio).getTime() < Date.now();
  }

  protected mover(n: number): void {
    this.fecha.set(sumarDias(this.fecha(), this.vista() === 'dia' ? n : 7 * n));
  }

  protected cargar(silencioso = false): void {
    if (!silencioso) this.cargando.set(true);
    const params = this.vista() === 'dia' ? { fecha: this.fecha() } : { desde: this.inicioSem(), hasta: sumarDias(this.inicioSem(), 6) };
    this.api.get<Cita[]>('/medico/citas', params).subscribe({
      next: (r) => {
        this.citas.set(r);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        if (!silencioso) this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  /** Inicia la atención (si hace falta) y abre el editor: uno nuevo para la cita, o el borrador que ya existe. */
  protected atender(c: Cita): void {
    const abrir = () => {
      if (c.atencion) void this.router.navigate(['/medico/atencion', c.atencion.id]);
      else void this.router.navigate(['/medico/atencion/nueva'], { queryParams: { paciente: c.paciente.id, cita: c.id } });
    };
    if (c.estado === 'EN_ATENCION') return abrir();
    this.api.post(`/citas/${c.id}/iniciar`).subscribe({ next: abrir, error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar') });
  }

  /** Cierra la cita. Si no hay una atención cerrada, pide confirmar que no se registró atención. */
  protected finalizar(c: Cita, sinAtencion = false): void {
    this.api.post(`/citas/${c.id}/finalizar`, sinAtencion ? { sinAtencion: true } : {}).subscribe({
      next: () => {
        this.snack.open('Cita finalizada', 'Cerrar');
        this.cargar(true);
      },
      error: async (e: { status?: number; error?: { codigo?: string } }) => {
        if (e.status === 409 && e.error?.codigo === 'ATENCION_PENDIENTE') {
          const r = await confirmar(this.dialog, { titulo: 'La cita no tiene una atención cerrada', texto: '¿Desea finalizarla sin registrar una atención clínica?', confirmar: 'Finalizar sin atención' });
          if (r) this.finalizar(c, true);
        } else this.snack.open(mensajeError(e), 'Cerrar');
      },
    });
  }

  protected async noAsistio(c: Cita): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Marcar inasistencia', texto: `${c.paciente.nombre} no se presentó a su cita.`, confirmar: 'Marcar' });
    if (!r) return;
    this.api.post(`/citas/${c.id}/no-asistio`).subscribe({ next: () => this.cargar(true), error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar') });
  }
}
