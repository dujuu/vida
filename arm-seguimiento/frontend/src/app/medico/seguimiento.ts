import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip, type ChartConfiguration } from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaHora, haceCuanto } from '../core/fechas';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, confirmar } from '../shared/piezas';

type EstadoHilo = 'AL_DIA' | 'EN_RIESGO' | 'DESERTOR' | 'CERRADO';

interface Fila {
  id: number;
  nombre: string;
  rut: string;
  estado: EstadoHilo;
  motivo: string;
  ultimaActividad: string | null;
  diasSinActividad: number | null;
  proximaCita: string | null;
}

const TARJETAS: ReadonlyArray<{ estado: EstadoHilo; titulo: string; icono: string; ayuda: string }> = [
  { estado: 'AL_DIA', titulo: 'Al día', icono: 'check_circle', ayuda: 'Con cita, tratamiento o actividad reciente' },
  { estado: 'EN_RIESGO', titulo: 'En riesgo', icono: 'warning', ayuda: 'Sin registros hace varios días' },
  { estado: 'DESERTOR', titulo: 'Desertores', icono: 'person_off', ayuda: 'Sin actividad ni cita futura' },
  { estado: 'CERRADO', titulo: 'Cerrados', icono: 'inventory_2', ayuda: 'Sin tratamiento ni control pendiente' },
];

/**
 * Seguimiento de continuidad: cuántos de sus pacientes siguen su tratamiento, quiénes están en riesgo de abandonarlo y qué tanto
 * leen sus indicaciones. Las tomas son un autorreporte del paciente y la clasificación es un apoyo, no un juicio clínico.
 */
@Component({
  selector: 'app-seguimiento-medico',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, RouterLink, BaseChartDirective],
  providers: [provideCharts({ registerables: [BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend] })],
  template: `
    <app-pagina titulo="Seguimiento" subtitulo="Continuidad de sus pacientes con el tratamiento">
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (rotulo()) { <p class="aviso"><mat-icon>info</mat-icon> {{ rotulo() }}</p> }

        <div class="tarjetas" role="group" aria-label="Filtrar por estado">
          @for (t of tarjetas; track t.estado) {
            <button type="button" class="resumen" [class.activa]="filtro() === t.estado" [attr.aria-pressed]="filtro() === t.estado" (click)="alternar(t.estado)">
              <mat-icon>{{ t.icono }}</mat-icon>
              <span class="cifra">{{ resumen()[t.estado] }}</span>
              <span class="titulo">{{ t.titulo }}</span>
              <small>{{ t.ayuda }}</small>
            </button>
          }
        </div>

        <mat-form-field class="buscar">
          <mat-label>Buscar por nombre o RUT</mat-label>
          <input matInput [formControl]="buscar" autocomplete="off" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        @if (pacientes().length === 0) {
          <div class="vacio"><mat-icon>groups</mat-icon><p>No hay pacientes con ese criterio.</p></div>
        } @else {
          <ul class="lista-tarjetas">
            @for (p of pacientes(); track p.id) {
              <li class="item">
                <span class="grande"><strong>{{ p.nombre }}</strong><small>RUT {{ p.rut }}</small><small>{{ p.motivo }}</small>
                  <small class="muted">{{ p.ultimaActividad ? 'Última actividad: ' + hace(p.ultimaActividad) : 'Sin actividad registrada' }} · {{ p.proximaCita ? 'Próxima cita: ' + hora(p.proximaCita) : 'sin cita futura' }}</small></span>
                <app-chip [estado]="p.estado" />
                <span class="acciones-fila">
                  <a mat-stroked-button [routerLink]="['../pacientes', p.id]"><mat-icon>folder_shared</mat-icon> Ficha</a>
                  @if (p.estado === 'EN_RIESGO' || p.estado === 'DESERTOR') { <button mat-stroked-button type="button" (click)="pedirContacto(p)"><mat-icon>call</mat-icon> Pedir contacto</button> }
                </span>
              </li>
            }
          </ul>
        }

        @if (lectura(); as l) {
          <section class="tarjeta lectura">
            <h2>Lectura de sus indicaciones</h2>
            <p>{{ l.tasaLectura === null ? 'Todavía no ha enviado indicaciones.' : l.leidas + ' de ' + l.enviadas + ' indicaciones leídas (' + l.tasaLectura + ' %)' }}</p>
            @if (l.porTipo.length > 0) { <div class="caja"><canvas baseChart [data]="grafico()" [type]="'bar'" [options]="opciones"></canvas></div> }
          </section>
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
    .resumen { display: grid; gap: .1rem; justify-items: start; text-align: left; padding: .85rem 1rem; border-radius: 16px; border: 1px solid var(--mat-sys-outline-variant); background: var(--mat-sys-surface-container-lowest); color: inherit; font: inherit; cursor: pointer; min-height: 44px; }
    .resumen.activa { border-color: var(--mat-sys-primary); background: var(--vn-suave); }
    .cifra { font: var(--mat-sys-headline-medium); } .titulo { font: var(--mat-sys-label-large); } small { color: var(--mat-sys-on-surface-variant); }
    .buscar { width: 100%; max-width: 420px; display: block; }
    .item { flex-wrap: wrap; } .acciones-fila { margin-left: auto; }
    .vacio { display: grid; justify-items: center; gap: .5rem; padding: 2rem; color: var(--mat-sys-on-surface-variant); }
    .lectura { margin-top: 1.5rem; } .caja { height: 240px; position: relative; }
  `,
})
export class SeguimientoMedico {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly tarjetas = TARJETAS;
  protected readonly buscar = new FormControl('', { nonNullable: true });
  protected readonly filtro = signal<EstadoHilo | null>(null);
  protected readonly resumen = signal<Record<EstadoHilo, number>>({ AL_DIA: 0, EN_RIESGO: 0, DESERTOR: 0, CERRADO: 0 });
  protected readonly pacientes = signal<Fila[]>([]);
  protected readonly rotulo = signal('');
  protected readonly lectura = signal<any>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly hace = haceCuanto;
  protected readonly hora = (v: string) => fechaHora(v);

  protected readonly opciones: ChartConfiguration<'bar'>['options'] = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } };
  protected readonly grafico = computed<ChartConfiguration<'bar'>['data']>(() => {
    const tipos: any[] = this.lectura()?.porTipo ?? [];
    const nombre = (t: string) => ({ MEDICAMENTO: 'Medicamentos', RUTINA: 'Rutinas', HABITO_EVITAR: 'Hábitos a evitar', OTRO: 'Otras' } as Record<string, string>)[t] ?? t;
    return {
      labels: tipos.map((t) => nombre(t.tipo)),
      datasets: [
        { label: 'Enviadas', data: tipos.map((t) => t.enviadas), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--mat-sys-outline').trim() || '#79747e' },
        { label: 'Leídas', data: tipos.map((t) => t.leidas), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--mat-sys-primary').trim() || '#0a4e99' },
      ],
    };
  });

  constructor() {
    Chart.defaults.font.family = 'Atkinson Hyperlegible Next Variable, system-ui, sans-serif';
    this.buscar.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.cargar());
    effect(() => {
      this.filtro();
      untracked(() => this.cargar());
    });
    this.api.get<any>('/dashboard/lectura').subscribe({ next: (l) => this.lectura.set(l), error: () => undefined });
  }

  protected alternar(e: EstadoHilo): void {
    this.filtro.set(this.filtro() === e ? null : e);
  }

  protected cargar(): void {
    this.cargando.set(this.pacientes().length === 0);
    this.api.get<{ rotulo: string; resumen: Record<EstadoHilo, number>; pacientes: Fila[] }>('/dashboard/medico', { estado: this.filtro() ?? undefined, buscar: this.buscar.value }).subscribe({
      next: (r) => {
        this.rotulo.set(r.rotulo);
        this.resumen.set(r.resumen);
        this.pacientes.set(r.pacientes);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected async pedirContacto(p: Fila): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Pedir contacto a recepción', texto: `Recepción verá a ${p.nombre} en sus contactos pendientes.`, motivo: 'Mensaje para recepción', confirmar: 'Pedir contacto' });
    if (!r) return;
    this.api.post(`/pacientes/${p.id}/solicitar-seguimiento`, { mensaje: r.motivo }).subscribe({
      next: () => this.snack.open('Solicitud enviada a recepción', 'Cerrar'),
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }
}
