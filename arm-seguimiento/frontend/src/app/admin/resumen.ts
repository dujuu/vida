import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip, type ChartConfiguration } from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaHora, hoyIso, sumarDias } from '../core/fechas';
import { ETIQUETA_ROL, type Rol } from '../core/models';
import { Estado, Pagina } from '../shared/piezas';

/** Una cifra del dashboard: o un número, o «menos de 5» cuando el grupo es tan chico que podría identificar a alguien. */
interface Cifra {
  menosDe5: boolean;
  cantidad: number | null;
}

const ESTADOS_CITA: Record<string, string> = {
  RESERVADA: 'Reservadas', EN_ESPERA: 'En espera', EN_ATENCION: 'En atención', ATENDIDA: 'Atendidas', CANCELADA: 'Canceladas', NO_ASISTIO: 'No asistieron',
};
const CANALES: Record<string, string> = { APP: 'En línea', MESON: 'Mesón', TELEFONO: 'Teléfono' };
const MEDIOS: Record<string, string> = { LLAMADA: 'Llamada', WHATSAPP: 'WhatsApp', CORREO: 'Correo', PRESENCIAL: 'Presencial' };

/**
 * Resumen del centro: continuidad de los pacientes por especialidad, citas del período, uso del sistema y estado del servidor. Son
 * cifras agregadas, sin nombres; un grupo de menos de 5 personas se muestra como «menos de 5». Las tomas son un autorreporte.
 */
@Component({
  selector: 'app-resumen-admin',
  imports: [Pagina, Estado, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule, BaseChartDirective],
  providers: [provideCharts({ registerables: [BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend] })],
  template: `
    <app-pagina titulo="Resumen del centro" subtitulo="Cifras agregadas, sin nombres de pacientes">
      <div class="fila filtros">
        <mat-form-field class="filtro"><mat-label>Especialidad</mat-label>
          <mat-select [value]="especialidad()" (selectionChange)="especialidad.set($event.value)"><mat-option [value]="null">Todas</mat-option>@for (e of especialidades(); track e.id) { <mat-option [value]="e.id">{{ e.nombre }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field class="filtro"><mat-label>Citas desde</mat-label><input matInput type="date" [value]="desde()" [max]="hoy" (change)="desde.set($any($event.target).value)" /></mat-form-field>
      </div>

      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (d(); as x) {
          <p class="aviso"><mat-icon>info</mat-icon> {{ x.rotulo }}</p>
          <section class="tarjeta">
            <h2>Continuidad de los pacientes</h2>
            @if (x.porEspecialidad.length === 0) { <p class="muted">Todavía no hay pacientes con relación de atención.</p> }
            @else {
              @if (hayDatos()) { <div class="caja"><canvas baseChart [data]="grafico()" [type]="'bar'" [options]="opciones"></canvas></div> } @else { <p class="muted">Todos los grupos tienen menos de 5 personas, por eso no se grafican.</p> }
              <div class="tabla-scroll">
                <table class="tabla">
                  <thead><tr><th>Especialidad</th><th>Al día</th><th>En riesgo</th><th>Desertores</th><th>Cerrados</th></tr></thead>
                  <tbody>@for (e of x.porEspecialidad; track e.especialidad) { <tr><td>{{ e.especialidad }}</td><td>{{ cifra(e.alDia) }}</td><td>{{ cifra(e.enRiesgo) }}</td><td>{{ cifra(e.desertores) }}</td><td>{{ cifra(e.cerrados) }}</td></tr> }</tbody>
                </table>
              </div>
            }
          </section>

          <section class="tarjeta">
            <h2>Citas desde el {{ desdeTexto() }}</h2>
            <ul class="datos">@for (c of x.citas; track c.estado) { <li><span>{{ estadoCita(c.estado) }}</span><strong>{{ cifra(c) }}</strong></li> } @empty { <li class="muted">Sin citas en el período.</li> }</ul>
          </section>
        }
      </app-estado>

      @if (m(); as u) {
        <section class="tarjeta">
          <h2>Uso del sistema</h2>
          <div class="rejilla-3">
            <div><h3>Usuarios activos</h3><ul class="datos">@for (r of u.usuariosActivosPorRol; track r.rol) { <li><span>{{ rol(r.rol) }}</span><strong>{{ r.cantidad }}</strong></li> }</ul><p class="muted">Con sesión en las últimas 24 h: {{ u.usuariosConSesionHoy }}</p></div>
            <div><h3>Citas por canal</h3><ul class="datos">@for (r of u.reservasPorCanal; track r.canal) { <li><span>{{ canal(r.canal) }}</span><strong>{{ r.cantidad }}</strong></li> } @empty { <li class="muted">Sin datos.</li> }</ul></div>
            <div><h3>Contactos por medio</h3><ul class="datos">@for (r of u.contactosPorMedio; track r.medio) { <li><span>{{ medio(r.medio) }}</span><strong>{{ r.cantidad }}</strong></li> } @empty { <li class="muted">Sin datos.</li> }</ul></div>
          </div>
        </section>
      }

      @if (s(); as e) {
        <section class="tarjeta">
          <h2>Estado del servidor</h2>
          <ul class="datos">
            <li><span>Versión</span><strong>{{ e.version }}</strong></li>
            <li><span>Modo</span><strong>{{ e.modo }}</strong></li>
            <li><span>Migraciones aplicadas</span><strong>{{ e.migracionesAplicadas }}</strong></li>
            <li><span>Último respaldo</span><strong>{{ e.ultimoRespaldo ? hora(e.ultimoRespaldo) : 'No registrado' }}</strong></li>
            @if (e.disco) { <li><span>Espacio libre en disco</span><strong>{{ (e.disco.libreMb / 1024).toFixed(1) }} GB de {{ (e.disco.totalMb / 1024).toFixed(1) }} GB</strong></li> }
          </ul>
          @if (sinRespaldoReciente()) { <p class="aviso aviso-error" role="alert"><mat-icon>warning</mat-icon> No hay un respaldo de los últimos 2 días. Revise la copia diaria de la base de datos y de los documentos.</p> }
        </section>
      }
    </app-pagina>
  `,
  styles: `
    .filtros { margin-bottom: .5rem; } .filtro { width: 16rem; } section.tarjeta { margin-bottom: 1rem; } .caja { height: 280px; position: relative; margin-bottom: 1rem; }
    .datos { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; } .datos li { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--mat-sys-outline-variant); padding: .25rem 0; }
  `,
})
export class ResumenAdmin {
  private readonly api = inject(Api);
  protected readonly hoy = hoyIso();
  protected readonly especialidades = signal<Array<{ id: number; nombre: string }>>([]);
  protected readonly especialidad = signal<number | null>(null);
  protected readonly desde = signal(sumarDias(hoyIso(), -30));
  protected readonly d = signal<any>(null);
  protected readonly m = signal<any>(null);
  protected readonly s = signal<any>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly hora = (v: string) => fechaHora(v);
  protected readonly rol = (r: string) => ETIQUETA_ROL[r as Rol] ?? r;
  protected readonly estadoCita = (e: string) => ESTADOS_CITA[e] ?? e;
  protected readonly canal = (c: string) => CANALES[c] ?? c;
  protected readonly medio = (c: string) => MEDIOS[c] ?? c;
  protected readonly cifra = (c: Cifra) => (c.menosDe5 ? 'menos de 5' : String(c.cantidad));
  protected readonly hayDatos = computed(() => ((this.d()?.porEspecialidad ?? []) as any[]).some((f) => [f.alDia, f.enRiesgo, f.desertores, f.cerrados].some((c: Cifra) => !c.menosDe5 && (c.cantidad ?? 0) > 0)));
  protected readonly desdeTexto = computed(() => this.desde().split('-').reverse().join('-'));
  protected readonly sinRespaldoReciente = computed(() => {
    const e = this.s();
    return !!e && (!e.ultimoRespaldo || Date.now() - new Date(e.ultimoRespaldo).getTime() > 2 * 86_400_000);
  });

  protected readonly opciones: ChartConfiguration<'bar'>['options'] = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } };
  protected readonly grafico = computed<ChartConfiguration<'bar'>['data']>(() => {
    const filas: any[] = this.d()?.porEspecialidad ?? [];
    const n = (c: Cifra) => c.cantidad ?? 0;
    return {
      labels: filas.map((f) => f.especialidad),
      datasets: [
        { label: 'Al día', data: filas.map((f) => n(f.alDia)), backgroundColor: '#2e7d32' },
        { label: 'En riesgo', data: filas.map((f) => n(f.enRiesgo)), backgroundColor: '#d9a400' },
        { label: 'Desertores', data: filas.map((f) => n(f.desertores)), backgroundColor: '#b3261e' },
        { label: 'Cerrados', data: filas.map((f) => n(f.cerrados)), backgroundColor: '#79747e' },
      ],
    };
  });

  constructor() {
    Chart.defaults.font.family = 'Atkinson Hyperlegible Next Variable, system-ui, sans-serif';
    this.api.get<Array<{ id: number; nombre: string }>>('/especialidades').subscribe({ next: (r) => this.especialidades.set(r), error: () => undefined });
    this.api.get<any>('/metricas').subscribe({ next: (r) => this.m.set(r), error: () => undefined });
    this.api.get<any>('/estado').subscribe({ next: (r) => this.s.set(r), error: () => undefined });
    effect(() => {
      this.especialidad();
      this.desde();
      untracked(() => this.cargar());
    });
  }

  protected cargar(): void {
    this.cargando.set(this.d() === null);
    this.api.get<any>('/dashboard/centro', { especialidad: this.especialidad() ?? undefined, desde: this.desde() }).subscribe({
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
}
