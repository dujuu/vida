import { Component, computed, effect, inject, input, numberAttribute, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip, type ChartConfiguration } from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { fechaCorta, fechaHora } from '../core/fechas';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, confirmar } from '../shared/piezas';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const colorTema = (v: string, defecto: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || defecto;

/** Describe una pauta en palabras. */
function describirPauta(p: any): string {
  if (p.modo === 'SEGUN_NECESIDAD') return 'Solo si hace falta (no genera tomas ni recordatorios)';
  const cuando = p.modo === 'CADA_N_HORAS' ? `cada ${p.intervaloHoras} horas` : `a las ${(p.horasLocales ?? []).join(', ')}`;
  const [fecha, hora] = (p.inicioLocal as string).split(' ');
  const dias = p.diasSemana?.length ? ` · ${p.diasSemana.map((n: number) => DIAS[n - 1]).join(', ')}` : ' · todos los días';
  return `${cuando} · ${p.duracionDias} días desde el ${fechaCorta(fecha)} a las ${hora}${dias}`;
}

/**
 * Detalle de una indicación: instrucciones, pauta vigente, historial de pautas y de versiones, y el seguimiento de las tomas.
 * Las tomas son un autorreporte del paciente: lo que no tiene registro se muestra aparte y nunca se cuenta como omitido.
 */
@Component({
  selector: 'app-indicacion-detalle',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, RouterLink, BaseChartDirective],
  providers: [provideCharts({ registerables: [BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend] })],
  template: `
    <app-pagina [titulo]="r()?.titulo ?? 'Indicación'" [subtitulo]="r() ? r().paciente.nombre + ' · ' + r().doctor.nombre : ''" [volver]="true">
      <div acciones class="fila">
        @if (r(); as x) {
          <app-chip [estado]="x.estado" />
          @if (x.estado === 'ACTIVA') {
            @if (esAutor()) {
              <button mat-stroked-button type="button" (click)="editando.set(!editando())"><mat-icon>edit</mat-icon> Corregir</button>
              @if (x.tienePauta) { <a mat-stroked-button [routerLink]="['pauta']"><mat-icon>schedule</mat-icon> Modificar pauta</a> }
            }
            <button mat-stroked-button type="button" class="peligro" (click)="suspender()"><mat-icon>block</mat-icon> Suspender</button>
          }
          <a mat-button [routerLink]="['/medico/pacientes', x.paciente.id]"><mat-icon>folder_shared</mat-icon> Ficha</a>
        }
      </div>

      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (r(); as x) {
          @if (x.estado === 'SUSPENDIDA') { <p class="aviso aviso-error"><mat-icon>block</mat-icon> Suspendida: {{ x.motivoSuspension }}</p> }

          @if (editando() && esAutor()) {
            <form class="tarjeta campos" [formGroup]="edicion" (ngSubmit)="guardarEdicion()" novalidate>
              <h2 class="ancho">Corregir la indicación</h2>
              <mat-form-field class="ancho"><mat-label>Título</mat-label><input matInput formControlName="titulo" maxlength="150" /></mat-form-field>
              <mat-form-field class="ancho"><mat-label>Instrucciones</mat-label><textarea matInput rows="4" formControlName="descripcion" maxlength="2000"></textarea></mat-form-field>
              @if (x.tipo === 'MEDICAMENTO' && !x.tienePauta) {
                <mat-form-field><mat-label>Medicamento</mat-label><input matInput formControlName="medicamento" maxlength="120" /></mat-form-field>
                <mat-form-field><mat-label>Dosis</mat-label><input matInput formControlName="dosis" maxlength="80" /></mat-form-field>
                <mat-form-field><mat-label>Vía</mat-label><input matInput formControlName="via" maxlength="40" /></mat-form-field>
              }
              <mat-form-field><mat-label>Fecha de término</mat-label><input matInput type="date" formControlName="fechaFin" /><mat-hint>{{ x.tienePauta ? 'Solo se puede acortar' : '' }}</mat-hint></mat-form-field>
              <mat-form-field class="ancho"><mat-label>Motivo del cambio</mat-label><input matInput formControlName="motivo" maxlength="200" /><mat-error>Indique el motivo (al menos 3 caracteres).</mat-error></mat-form-field>
              <div class="ancho acciones-fila"><button mat-flat-button type="submit">Guardar corrección</button><button mat-button type="button" (click)="editando.set(false)">Cancelar</button></div>
            </form>
          }

          <section class="tarjeta">
            <h2>Instrucciones</h2>
            <p class="texto">{{ x.descripcion }}</p>
            @if (x.medicamento) { <p><strong>{{ x.medicamento }}</strong>{{ x.presentacion ? ' · ' + x.presentacion : '' }} · {{ x.dosis }} · {{ x.via }}</p> }
            <p class="muted">Vigencia: {{ x.fechaInicio ? 'desde ' + fecha(x.fechaInicio) : '' }}{{ x.fechaFin ? ' hasta ' + fecha(x.fechaFin) : ' sin fecha de término' }} · versión {{ x.version }} ·
              {{ x.leidaAt ? 'leída por el paciente el ' + hora(x.leidaAt) : 'todavía no la lee el paciente' }}</p>
          </section>

          @if (x.pautaVigente; as p) {
            <section class="tarjeta">
              <h2>Pauta vigente <small class="muted">(versión {{ p.version }})</small></h2>
              <p>{{ describir(p) }}</p>
              <p class="muted">Esta indicación no reemplaza la receta médica.</p>
            </section>
          }

          @if (x.tienePauta) {
            <section class="tarjeta">
              <h2>Seguimiento de las tomas</h2>
              <p class="aviso"><mat-icon>info</mat-icon> Es un autorreporte del paciente. Una toma sin registro no significa que no la tomó.</p>
              <app-estado [cargando]="cargandoSeg()" [error]="errorSeg()" [vacio]="!seg() || seg().dias.length === 0" mensaje="Todavía no hay tomas programadas." icono="event_busy" (reintento)="cargarSeguimiento()">
                @if (seg(); as s) {
                  <div class="caja"><canvas baseChart [data]="grafico()" [type]="'bar'" [options]="opciones"></canvas></div>
                  <dl class="totales">
                    <div><dt>Tomadas</dt><dd>{{ s.totales.realizadas }}</dd></div>
                    <div><dt>No la tomó</dt><dd>{{ s.totales.omitidas }}</dd></div>
                    <div><dt>Sin registro</dt><dd>{{ s.totales.sinRegistro }}</dd></div>
                    <div><dt>Por venir</dt><dd>{{ s.totales.futuras }}</dd></div>
                    <div><dt>Cumplimiento declarado</dt><dd>{{ s.cumplimientoDeclarado === null ? '–' : s.cumplimientoDeclarado + ' %' }}</dd></div>
                  </dl>
                  <p class="muted">{{ s.nota }}</p>
                }
              </app-estado>
            </section>
          }

          @if (x.pautasAnteriores.length > 0) {
            <section class="tarjeta">
              <h2>Pautas anteriores</h2>
              <ul class="historial">@for (p of x.pautasAnteriores; track p.version) { <li><strong>Versión {{ p.version }}</strong> · {{ describir(p) }}@if (p.medicamento) { · {{ p.medicamento }} {{ p.dosis }} }<br /><small class="muted">Reemplazada · {{ p.motivoCambio || 'sin motivo registrado' }}</small></li> }</ul>
            </section>
          }

          @if (x.versiones.length > 0) {
            <section class="tarjeta">
              <h2>Historial de cambios</h2>
              <ul class="historial">@for (v of x.versiones; track v.version) { <li><strong>Antes de la versión {{ v.version + 1 }}</strong> · {{ hora(v.fecha) }} · {{ v.cambiadoPor }}<br /><small class="muted">Motivo: {{ v.motivo }}</small>
                <br /><small>«{{ v.contenido.titulo }}» — {{ v.contenido.descripcion }}</small></li> }</ul>
            </section>
          }
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .texto { white-space: pre-line; } section.tarjeta { margin-bottom: 1rem; } .caja { height: 260px; position: relative; margin-bottom: 1rem; }
    .totales { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: .75rem; margin: 0 0 .75rem; } .totales dt { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-label-medium); } .totales dd { margin: 0; font: var(--mat-sys-headline-small); }
    .historial { list-style: none; padding: 0; margin: 0; display: grid; gap: .75rem; }
  `,
})
export class IndicacionDetalle {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Identificador de la indicación (parámetro de la ruta). */
  readonly id = input.required({ transform: numberAttribute });
  protected readonly r = signal<any>(null);
  protected readonly seg = signal<any>(null);
  protected readonly cargando = signal(true);
  protected readonly cargandoSeg = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorSeg = signal<string | null>(null);
  protected readonly editando = signal(false);
  protected readonly esAutor = computed(() => this.r()?.doctor?.id === this.auth.usuario()?.id);
  protected readonly fecha = fechaCorta;
  protected readonly hora = (v: string | Date) => fechaHora(v);
  protected readonly describir = describirPauta;
  protected readonly edicion = this.fb.group({
    titulo: ['', [Validators.required, Validators.minLength(3)]],
    descripcion: ['', [Validators.required, Validators.minLength(5)]],
    medicamento: [''],
    dosis: [''],
    via: [''],
    fechaFin: [''],
    motivo: ['', [Validators.required, Validators.minLength(3)]],
  });

  protected readonly opciones: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
  };
  protected readonly grafico = computed<ChartConfiguration<'bar'>['data']>(() => {
    const dias: any[] = this.seg()?.dias ?? [];
    return {
      labels: dias.map((d) => fechaCorta(d.fecha).replace(/ \d{4}$/, '')),
      datasets: [
        { label: 'Tomadas', data: dias.map((d) => d.realizadas), backgroundColor: '#2e7d32' },
        { label: 'No la tomó', data: dias.map((d) => d.omitidas), backgroundColor: '#d9a400' },
        { label: 'Sin registro', data: dias.map((d) => d.sinRegistro), backgroundColor: colorTema('--mat-sys-outline', '#79747e') },
        { label: 'Por venir', data: dias.map((d) => d.futuras), backgroundColor: colorTema('--mat-sys-primary-container', '#d0e4ff') },
      ],
    };
  });

  constructor() {
    Chart.defaults.font.family = 'Atkinson Hyperlegible Next Variable, system-ui, sans-serif';
    effect(() => {
      this.id();
      untracked(() => this.cargar());
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any>(`/recomendaciones/${this.id()}`).subscribe({
      next: (r) => {
        this.r.set(r);
        this.edicion.reset({ titulo: r.titulo, descripcion: r.descripcion, medicamento: r.medicamento ?? '', dosis: r.dosis ?? '', via: r.via ?? '', fechaFin: r.fechaFin ?? '', motivo: '' });
        this.error.set(null);
        this.cargando.set(false);
        if (r.tienePauta) this.cargarSeguimiento();
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected cargarSeguimiento(): void {
    this.cargandoSeg.set(true);
    this.api.get<any>(`/seguimiento/indicacion/${this.id()}`).subscribe({
      next: (s) => {
        this.seg.set(s);
        this.errorSeg.set(null);
        this.cargandoSeg.set(false);
      },
      error: (e: unknown) => {
        this.errorSeg.set(mensajeError(e));
        this.cargandoSeg.set(false);
      },
    });
  }

  protected guardarEdicion(): void {
    if (this.edicion.invalid) return this.edicion.markAllAsTouched();
    const v = this.edicion.getRawValue();
    const x = this.r();
    const cuerpo: Record<string, string> = { motivo: v.motivo };
    if (v.titulo !== x.titulo) cuerpo['titulo'] = v.titulo;
    if (v.descripcion !== x.descripcion) cuerpo['descripcion'] = v.descripcion;
    if (v.fechaFin && v.fechaFin !== x.fechaFin) cuerpo['fechaFin'] = v.fechaFin;
    if (x.tipo === 'MEDICAMENTO' && !x.tienePauta) {
      if (v.medicamento !== (x.medicamento ?? '')) cuerpo['medicamento'] = v.medicamento;
      if (v.dosis !== (x.dosis ?? '')) cuerpo['dosis'] = v.dosis;
      if (v.via !== (x.via ?? '')) cuerpo['via'] = v.via;
    }
    if (Object.keys(cuerpo).length === 1) {
      this.snack.open('No hay cambios que guardar', 'Cerrar');
      return;
    }
    this.api.patch(`/recomendaciones/${this.id()}`, cuerpo).subscribe({
      next: () => {
        this.editando.set(false);
        this.snack.open('Corrección guardada. El paciente recibió un aviso.', 'Cerrar', { duration: 5000 });
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }

  protected async suspender(): Promise<void> {
    const r = await confirmar(this.dialog, {
      titulo: 'Suspender la indicación',
      texto: 'Se anularán las tomas futuras y el paciente recibirá un aviso. No se borra nada: queda en el historial.',
      motivo: 'Motivo de la suspensión',
      confirmar: 'Suspender',
      peligro: true,
    });
    if (!r) return;
    this.api.post(`/recomendaciones/${this.id()}/suspender`, { motivo: r.motivo }).subscribe({
      next: () => {
        this.snack.open('Indicación suspendida', 'Cerrar');
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }
}
