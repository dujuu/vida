import { Component, Directive, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CategoryScale, Chart, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip, type ChartConfiguration } from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaCorta, fechaHora, fechaLocal, hoyIso } from '../core/fechas';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, confirmar, guardarArchivo } from '../shared/piezas';

/** Lee una variable CSS del tema (Chart.js dibuja en un canvas y no entiende variables CSS). */
const colorTema = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const TIPOS_ANT = [
  { v: 'MORBIDO', t: 'Mórbido' }, { v: 'QUIRURGICO', t: 'Quirúrgico' }, { v: 'FAMILIAR', t: 'Familiar' },
  { v: 'ALERGIA', t: 'Alergia' }, { v: 'HABITO', t: 'Hábito' }, { v: 'MEDICAMENTO', t: 'Medicamento habitual' },
];

/** Lógica común de una pestaña: carga con estado y recarga. */
@Directive()
abstract class Pestana {
  protected readonly api = inject(Api);
  protected readonly snack = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly fb = inject(NonNullableFormBuilder);
  readonly pacienteId = input.required<number>();
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  /** Fecha pura (AAAA-MM-DD). */
  protected readonly fecha = fechaCorta;
  /** Fecha de un instante UTC, en la hora del centro. */
  protected readonly dia = (v: string | Date) => fechaCorta(fechaLocal(v));
  protected readonly hora = fechaHora;

  protected avisarError(e: unknown): void {
    this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
  }
}

// ───────────────────────── Resumen ─────────────────────────

/** Resumen de la ficha (lo carga la página): alergias, problemas activos, indicaciones activas, últimas atenciones y la continuidad del paciente. */
@Component({
  selector: 'app-tab-resumen',
  imports: [ChipEstado, MatIconModule, MatButtonModule, RouterLink],
  template: `
    @if (datos(); as x) {
      @if (x.soloPropio) { <p class="aviso aviso-error"><mat-icon>lock</mat-icon>Su relación con este paciente está cerrada: solo ve lo que usted escribió.</p> }
      @if (seg(); as s) {
        @if (s.continuidad) {
          <section class="tarjeta fila-espaciada">
            <div><h2>Continuidad</h2><p><app-chip [estado]="s.continuidad.estado" /> <span class="muted">{{ s.continuidad.motivo }}</span></p>
              <p class="muted">Indicaciones leídas: {{ s.lectura.leidas }} de {{ s.lectura.enviadas }} · Tomas (autorreporte): {{ s.tomas.realizadas }} tomadas, {{ s.tomas.omitidas }} no tomadas, {{ s.tomas.sinRegistro }} sin registro · Citas: {{ s.citas.atendidas }} atendidas, {{ s.citas.noAsistio }} inasistencias</p></div>
            @if (s.continuidad.estado === 'EN_RIESGO' || s.continuidad.estado === 'DESERTOR') { <button mat-stroked-button type="button" (click)="solicitar()"><mat-icon>call</mat-icon> Pedir contacto a recepción</button> }
          </section>
        }
      }
      <div class="rejilla-2 bloques">
        <section class="tarjeta"><h2>Alergias</h2>
          @for (a of x.alergias ?? []; track a.id) { <p class="alergia">{{ a.descripcion }} {{ a.severidad ? '(' + a.severidad.toLowerCase() + ')' : '' }} {{ a.reaccion ? '· ' + a.reaccion : '' }}</p> } @empty { <p class="muted">Sin alergias registradas.</p> }
        </section>
        <section class="tarjeta"><h2>Problemas activos</h2>
          @for (d of x.problemasActivos ?? []; track d.id) { <p>• {{ d.descripcion }} {{ d.codigoCie10 ? '(' + d.codigoCie10 + ')' : '' }}</p> } @empty { <p class="muted">Sin diagnósticos activos.</p> }
        </section>
        <section class="tarjeta"><h2>Indicaciones activas</h2>
          @for (i of x.indicacionesActivas ?? []; track i.id) { <p><a [routerLink]="['/medico/indicaciones', i.id]">{{ i.titulo }}</a> <span class="muted">· {{ i.doctor }}</span></p> } @empty { <p class="muted">Sin indicaciones activas.</p> }
        </section>
        <section class="tarjeta"><h2>Últimas atenciones</h2>
          @for (a of x.ultimasAtenciones; track a.id) { <p><a [routerLink]="['/medico/atencion', a.id]">{{ hora(a.fecha) }}</a> · {{ a.medico }} · {{ a.motivo }} @if (a.estado === 'BORRADOR') { <app-chip estado="BORRADOR" /> }</p> } @empty { <p class="muted">Todavía no hay atenciones.</p> }
          @if (x.borradoresPendientes) { <p class="aviso aviso-error">Tiene {{ x.borradoresPendientes }} borrador(es) sin cerrar con este paciente.</p> }
        </section>
      </div>
      @if (!x.soloPropio) {
        <p class="cierre"><button mat-button type="button" class="peligro" (click)="cerrarRelacion()"><mat-icon>person_remove</mat-icon> Cerrar mi relación de atención con este paciente</button></p>
      }
    }
  `,
  styles: `.bloques { margin-top: 1rem; } .tarjeta p { margin: .3rem 0; } .cierre { margin-top: 1.5rem; }`,
})
export class TabResumen extends Pestana {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly datos = input.required<any>();
  protected readonly seg = signal<any>(null);

  constructor() {
    super();
    effect(() => {
      const d = this.datos();
      if (d && !d.soloPropio) this.api.get<any>(`/seguimiento/paciente/${this.pacienteId()}`).subscribe({ next: (s) => this.seg.set(s), error: () => undefined });
    });
  }

  /** Termina la relación de atención. Después solo se ve lo que uno mismo escribió; nada se borra. */
  protected async cerrarRelacion(): Promise<void> {
    const r = await confirmar(this.dialog, {
      titulo: 'Cerrar la relación de atención',
      texto: 'Dejará de ver a este paciente en su lista y de ver lo que escribieron otros médicos. Solo verá lo que usted mismo escribió. No se borra nada, y recepción puede volver a asignarle al paciente.',
      motivo: 'Motivo del cierre',
      confirmar: 'Cerrar relación',
      peligro: true,
    });
    if (!r) return;
    this.api.post(`/relaciones/${this.auth.usuario()?.id}/${this.pacienteId()}/cerrar`, { motivo: r.motivo }).subscribe({
      next: () => {
        this.snack.open('Relación cerrada', 'Cerrar', { duration: 4000 });
        void this.router.navigateByUrl('/medico/pacientes');
      },
      error: (e: unknown) => this.avisarError(e),
    });
  }

  protected async solicitar(): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Pedir contacto a recepción', texto: 'Recepción verá este paciente en sus contactos pendientes.', motivo: 'Mensaje para recepción', confirmar: 'Pedir contacto' });
    if (!r) return;
    this.api.post(`/pacientes/${this.pacienteId()}/solicitar-seguimiento`, { mensaje: r.motivo }).subscribe({ next: () => this.snack.open('Solicitud enviada a recepción', 'Cerrar'), error: (e: unknown) => this.avisarError(e) });
  }
}

// ───────────────────────── Atenciones ─────────────────────────

/** Historial de atenciones. Los borradores solo los ve su autor. */
@Component({
  selector: 'app-tab-atenciones',
  imports: [Estado, ChipEstado, MatIconModule, RouterLink],
  template: `
    <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="No hay atenciones registradas." icono="clinical_notes" (reintento)="cargar()">
      <ul class="lista-tarjetas">
        @for (a of lista(); track a.id) {
          <li><a class="item" [routerLink]="['/medico/atencion', a.id]"><span class="grande"><strong>{{ hora(a.fecha) }}</strong><small>{{ a.medico }} · {{ a.especialidad }}</small><span>{{ a.motivo }}</span></span>
            <app-chip [estado]="a.estado" />@if (a.enmiendas) { <app-chip [etiqueta]="a.enmiendas + ' enmienda(s)'" color="info" /> }<mat-icon>chevron_right</mat-icon></a></li>
        }
      </ul>
    </app-estado>
  `,
  styles: `a.item { text-decoration: none; color: inherit; flex-wrap: wrap; }`,
})
export class TabAtenciones extends Pestana {
  protected readonly lista = signal<any[]>([]);
  constructor() {
    super();
    effect(() => {
      this.pacienteId();
      this.cargar();
    });
  }
  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any>(`/ficha/${this.pacienteId()}/atenciones`, { tamano: 100 }).subscribe({
      next: (r) => {
        this.lista.set(r.items);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}

// ───────────────────────── Antecedentes ─────────────────────────

/** Antecedentes del paciente. Se corrigen o se cierran; no se borran. */
@Component({
  selector: 'app-tab-antecedentes',
  imports: [Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatSlideToggleModule],
  template: `
    <div class="fila-espaciada barra">
      <mat-slide-toggle [checked]="soloVigentes()" (change)="soloVigentes.set($event.checked); cargar()">Solo vigentes</mat-slide-toggle>
      <button mat-flat-button type="button" (click)="agregando.set(!agregando())"><mat-icon>add</mat-icon> Agregar antecedente</button>
    </div>
    @if (agregando()) {
      <form class="tarjeta campos nuevo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <mat-form-field><mat-label>Tipo</mat-label><mat-select formControlName="tipo">@for (t of tipos; track t.v) { <mat-option [value]="t.v">{{ t.t }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field class="ancho"><mat-label>Descripción</mat-label><input matInput formControlName="descripcion" maxlength="200" /><mat-error>Describa el antecedente.</mat-error></mat-form-field>
        @if (form.value.tipo === 'ALERGIA') {
          <mat-form-field><mat-label>Severidad</mat-label><mat-select formControlName="severidad"><mat-option value="">Sin indicar</mat-option><mat-option value="LEVE">Leve</mat-option><mat-option value="MODERADA">Moderada</mat-option><mat-option value="GRAVE">Grave</mat-option></mat-select></mat-form-field>
          <mat-form-field><mat-label>Reacción</mat-label><input matInput formControlName="reaccion" maxlength="200" /></mat-form-field>
        }
        <mat-form-field class="ancho"><mat-label>Detalle</mat-label><textarea matInput rows="2" formControlName="detalle" maxlength="1000"></textarea></mat-form-field>
        <div class="ancho acciones-fila"><button mat-flat-button type="submit">Guardar</button><button mat-button type="button" (click)="agregando.set(false)">Cancelar</button></div>
      </form>
    }
    <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="No hay antecedentes registrados." icono="history_edu" (reintento)="cargar()">
      <ul class="lista-tarjetas">
        @for (a of lista(); track a.id) {
          <li class="item" [class.alerta]="a.tipo === 'ALERGIA' && a.vigente">
            <span class="grande"><strong>{{ a.descripcion }}</strong><small>{{ nombreTipo(a.tipo) }}{{ a.severidad ? ' · ' + a.severidad.toLowerCase() : '' }}{{ a.reaccion ? ' · ' + a.reaccion : '' }}{{ a.desde ? ' · desde ' + fecha(a.desde) : '' }}</small>@if (a.detalle) { <span>{{ a.detalle }}</span> }</span>
            @if (!a.vigente) { <app-chip etiqueta="Cerrado" color="neutro" /> } @else { <button mat-button type="button" (click)="cerrar(a)">Cerrar</button> }
          </li>
        }
      </ul>
    </app-estado>
  `,
  styles: `.barra { margin-bottom: .75rem; } .nuevo { margin-bottom: 1rem; }`,
})
export class TabAntecedentes extends Pestana {
  protected readonly lista = signal<any[]>([]);
  protected readonly soloVigentes = signal(false);
  protected readonly agregando = signal(false);
  protected readonly tipos = TIPOS_ANT;
  protected readonly form = this.fb.group({ tipo: ['MORBIDO'], descripcion: ['', [Validators.required, Validators.minLength(2)]], detalle: [''], severidad: [''], reaccion: [''] });

  constructor() {
    super();
    effect(() => {
      this.pacienteId();
      this.cargar();
    });
  }

  protected nombreTipo = (t: string) => TIPOS_ANT.find((x) => x.v === t)?.t ?? t;

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any[]>(`/ficha/${this.pacienteId()}/antecedentes`, { soloVigentes: this.soloVigentes() || undefined }).subscribe({
      next: (r) => {
        this.lista.set(r);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected guardar(): void {
    if (this.form.invalid) return this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    const cuerpo: Record<string, unknown> = { tipo: v.tipo, descripcion: v.descripcion, detalle: v.detalle || undefined, severidad: v.tipo === 'ALERGIA' ? v.severidad || undefined : undefined, reaccion: v.tipo === 'ALERGIA' ? v.reaccion || undefined : undefined };
    this.api.post(`/ficha/${this.pacienteId()}/antecedentes`, cuerpo).subscribe({
      next: () => {
        this.form.reset({ tipo: 'MORBIDO', descripcion: '', detalle: '', severidad: '', reaccion: '' });
        this.agregando.set(false);
        this.cargar();
      },
      error: (e: unknown) => this.avisarError(e),
    });
  }

  protected async cerrar(a: { id: number; descripcion: string }): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Cerrar antecedente', texto: `«${a.descripcion}» dejará de estar vigente. No se borra: queda en el historial.`, confirmar: 'Cerrar' });
    if (!r) return;
    this.api.patch(`/antecedentes/${a.id}`, { vigente: false }).subscribe({ next: () => this.cargar(), error: (e: unknown) => this.avisarError(e) });
  }
}

// ───────────────────────── Diagnósticos ─────────────────────────

/** Lista de problemas del paciente. El texto no se edita: un diagnóstico erróneo se descarta y se crea otro. */
@Component({
  selector: 'app-tab-diagnosticos',
  imports: [Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="barra"><button mat-flat-button type="button" (click)="agregando.set(!agregando())"><mat-icon>add</mat-icon> Agregar diagnóstico</button></div>
    @if (agregando()) {
      <form class="tarjeta campos nuevo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <mat-form-field class="ancho"><mat-label>Diagnóstico</mat-label><input matInput formControlName="descripcion" maxlength="300" /><mat-error>Describa el diagnóstico.</mat-error></mat-form-field>
        <mat-form-field><mat-label>Código CIE-10 (opcional)</mat-label><input matInput formControlName="codigoCie10" placeholder="J06.9" /><mat-error>Formato como J06.9</mat-error></mat-form-field>
        <div class="ancho acciones-fila"><button mat-flat-button type="submit">Guardar</button><button mat-button type="button" (click)="agregando.set(false)">Cancelar</button></div>
      </form>
    }
    <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="No hay diagnósticos registrados." icono="diagnosis" (reintento)="cargar()">
      <ul class="lista-tarjetas">
        @for (d of lista(); track d.id) {
          <li class="item"><span class="grande"><strong>{{ d.descripcion }}</strong><small>{{ d.codigoCie10 || 'Sin código' }} · {{ dia(d.createdAt) }}{{ d.principal ? ' · principal' : '' }}</small></span>
            <app-chip [estado]="d.estado" />
            @if (d.estado === 'ACTIVO') { <button mat-button type="button" (click)="cambiar(d, 'RESUELTO')">Resuelto</button><button mat-button type="button" (click)="cambiar(d, 'DESCARTADO')">Descartar</button> }</li>
        }
      </ul>
    </app-estado>
  `,
  styles: `.barra { margin-bottom: .75rem; } .nuevo { margin-bottom: 1rem; }`,
})
export class TabDiagnosticos extends Pestana {
  protected readonly lista = signal<any[]>([]);
  protected readonly agregando = signal(false);
  protected readonly form = this.fb.group({ descripcion: ['', [Validators.required, Validators.minLength(3)]], codigoCie10: ['', Validators.pattern(/^([A-Za-z]\d{2}(\.\d{1,2})?)?$/)] });

  constructor() {
    super();
    effect(() => {
      this.pacienteId();
      this.cargar();
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any[]>(`/ficha/${this.pacienteId()}/diagnosticos`).subscribe({
      next: (r) => {
        this.lista.set(r);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected guardar(): void {
    if (this.form.invalid) return this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    this.api.post(`/ficha/${this.pacienteId()}/diagnosticos`, { descripcion: v.descripcion, codigoCie10: v.codigoCie10 || undefined }).subscribe({
      next: () => {
        this.form.reset();
        this.agregando.set(false);
        this.cargar();
      },
      error: (e: unknown) => this.avisarError(e),
    });
  }

  protected cambiar(d: { id: number }, estado: string): void {
    this.api.patch(`/diagnosticos/${d.id}`, { estado }).subscribe({ next: () => this.cargar(), error: (e: unknown) => this.avisarError(e) });
  }
}

// ───────────────────────── Exámenes ─────────────────────────

/** Exámenes solicitados y sus resultados. El resultado se registra una sola vez. */
@Component({
  selector: 'app-tab-examenes',
  imports: [Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <div class="barra"><button mat-flat-button type="button" (click)="agregando.set(!agregando())"><mat-icon>add</mat-icon> Solicitar examen</button></div>
    @if (agregando()) {
      <form class="tarjeta campos nuevo" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <mat-form-field><mat-label>Examen</mat-label><input matInput formControlName="nombre" maxlength="150" /><mat-error>Escriba el nombre.</mat-error></mat-form-field>
        <mat-form-field><mat-label>Tipo</mat-label><mat-select formControlName="tipo"><mat-option value="LABORATORIO">Laboratorio</mat-option><mat-option value="IMAGEN">Imagen</mat-option><mat-option value="OTRO">Otro</mat-option></mat-select></mat-form-field>
        <mat-form-field class="ancho"><mat-label>Indicaciones</mat-label><input matInput formControlName="indicaciones" maxlength="500" /></mat-form-field>
        <div class="ancho acciones-fila"><button mat-flat-button type="submit">Solicitar</button><button mat-button type="button" (click)="agregando.set(false)">Cancelar</button></div>
      </form>
    }
    <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="No hay exámenes registrados." icono="biotech" (reintento)="cargar()">
      <ul class="lista-tarjetas">
        @for (e of lista(); track e.id) {
          <li class="item examen"><div class="fila-espaciada"><span class="grande"><strong>{{ e.nombre }}</strong><small>{{ e.tipo }} · {{ dia(e.createdAt) }}{{ e.indicaciones ? ' · ' + e.indicaciones : '' }}</small></span><app-chip [estado]="e.estado" /></div>
            @if (e.estado === 'CON_RESULTADO') { <p class="resultado"><strong>Resultado ({{ e.fechaResultado ? fecha(e.fechaResultado) : '' }}):</strong> {{ e.resultado }}</p> }
            @if (e.estado === 'SOLICITADO') {
              @if (registrando() === e.id) {
                <mat-form-field><mat-label>Resultado</mat-label><textarea matInput rows="3" [formControl]="resultado" maxlength="10000"></textarea></mat-form-field>
                <div class="acciones-fila"><button mat-flat-button type="button" (click)="registrar(e)" [disabled]="!resultado.value.trim()">Guardar resultado</button><button mat-button type="button" (click)="registrando.set(null)">Cancelar</button></div>
              } @else { <div class="acciones-fila"><button mat-stroked-button type="button" (click)="registrando.set(e.id)">Registrar resultado</button><button mat-button type="button" class="peligro" (click)="anular(e)">Anular</button></div> }
            }
          </li>
        }
      </ul>
    </app-estado>
  `,
  styles: `.barra { margin-bottom: .75rem; } .nuevo { margin-bottom: 1rem; } .examen { display: grid; gap: .5rem; } .resultado { background: var(--mat-sys-surface-container); padding: .6rem; border-radius: 8px; white-space: pre-line; }`,
})
export class TabExamenes extends Pestana {
  protected readonly lista = signal<any[]>([]);
  protected readonly agregando = signal(false);
  protected readonly registrando = signal<number | null>(null);
  protected readonly form = this.fb.group({ nombre: ['', [Validators.required, Validators.minLength(2)]], tipo: ['LABORATORIO'], indicaciones: [''] });
  protected readonly resultado = this.fb.control('');

  constructor() {
    super();
    effect(() => {
      this.pacienteId();
      this.cargar();
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any[]>(`/ficha/${this.pacienteId()}/examenes`).subscribe({
      next: (r) => {
        this.lista.set(r);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected guardar(): void {
    if (this.form.invalid) return this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    this.api.post(`/ficha/${this.pacienteId()}/examenes`, { nombre: v.nombre, tipo: v.tipo, indicaciones: v.indicaciones || undefined }).subscribe({
      next: () => {
        this.form.reset({ nombre: '', tipo: 'LABORATORIO', indicaciones: '' });
        this.agregando.set(false);
        this.cargar();
      },
      error: (e: unknown) => this.avisarError(e),
    });
  }

  protected registrar(e: { id: number }): void {
    this.api.patch(`/examenes/${e.id}`, { resultado: this.resultado.value.trim(), fechaResultado: hoyIso() }).subscribe({
      next: () => {
        this.resultado.reset('');
        this.registrando.set(null);
        this.cargar();
      },
      error: (err: unknown) => this.avisarError(err),
    });
  }

  protected async anular(e: { id: number; nombre: string }): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Anular examen', texto: `«${e.nombre}» quedará anulado.`, confirmar: 'Anular', peligro: true });
    if (r) this.api.patch(`/examenes/${e.id}`, { anular: true }).subscribe({ next: () => this.cargar(), error: (err: unknown) => this.avisarError(err) });
  }
}

// ───────────────────────── Documentos ─────────────────────────

/** Documentos adjuntos (PDF, JPG o PNG de hasta 10 MB). Se descargan por una ruta protegida con verificación de integridad. */
@Component({
  selector: 'app-tab-documentos',
  imports: [Estado, MatButtonModule, MatIconModule],
  template: `
    <div class="barra">
      <input #archivo type="file" accept="application/pdf,image/jpeg,image/png" hidden (change)="subir($event)" />
      <button mat-flat-button type="button" (click)="archivo.click()" [disabled]="subiendo()"><mat-icon>upload_file</mat-icon> {{ subiendo() ? 'Subiendo…' : 'Subir documento' }}</button>
      <span class="muted"> PDF, JPG o PNG de hasta 10 MB</span>
    </div>
    <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="No hay documentos adjuntos." icono="description" (reintento)="cargar()">
      <ul class="lista-tarjetas">
        @for (d of lista(); track d.id) {
          <li class="item"><mat-icon>{{ d.tipo === 'application/pdf' ? 'picture_as_pdf' : 'image' }}</mat-icon><span class="grande"><strong>{{ d.nombre }}</strong><small>{{ hora(d.fecha) }} · {{ (d.tamano / 1024).toFixed(0) }} KB{{ d.descripcion ? ' · ' + d.descripcion : '' }}</small></span>
            <button mat-stroked-button type="button" (click)="bajar(d)">Descargar</button><button mat-button type="button" class="peligro" (click)="anular(d)">Anular</button></li>
        }
      </ul>
    </app-estado>
  `,
  styles: `.barra { margin-bottom: .75rem; display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }`,
})
export class TabDocumentos extends Pestana {
  protected readonly lista = signal<any[]>([]);
  protected readonly subiendo = signal(false);

  constructor() {
    super();
    effect(() => {
      this.pacienteId();
      this.cargar();
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any[]>(`/ficha/${this.pacienteId()}/documentos`).subscribe({
      next: (r) => {
        this.lista.set(r);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected subir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    if (archivo.size > 10 * 1024 * 1024) {
      this.snack.open('El archivo supera los 10 MB', 'Cerrar');
      return;
    }
    this.subiendo.set(true);
    this.api.subir(`/ficha/${this.pacienteId()}/documentos`, archivo).subscribe({
      next: () => {
        this.subiendo.set(false);
        input.value = '';
        this.cargar();
      },
      error: (e: unknown) => {
        this.subiendo.set(false);
        input.value = '';
        this.avisarError(e);
      },
    });
  }

  protected bajar(d: { id: number; nombre: string }): void {
    this.api.descargar(`/documentos/${d.id}/archivo`).subscribe({ next: (b) => guardarArchivo(b, d.nombre), error: (e: unknown) => this.avisarError(e) });
  }

  protected async anular(d: { id: number; nombre: string }): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Anular documento', texto: `«${d.nombre}» dejará de mostrarse. Solo puede anularlo quien lo subió.`, confirmar: 'Anular', peligro: true });
    if (r) this.api.patch(`/documentos/${d.id}/anular`).subscribe({ next: () => this.cargar(), error: (e: unknown) => this.avisarError(e) });
  }
}

// ───────────────────────── Indicaciones ─────────────────────────

/** Todas las indicaciones del paciente, de cualquier médico. */
@Component({
  selector: 'app-tab-indicaciones',
  imports: [Estado, ChipEstado, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <div class="barra"><a mat-flat-button [routerLink]="['indicar']"><mat-icon>add</mat-icon> Nueva indicación</a></div>
    <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="No hay indicaciones." icono="sticky_note_2" (reintento)="cargar()">
      <ul class="lista-tarjetas">
        @for (i of lista(); track i.id) {
          <li><a class="item" [routerLink]="['/medico/indicaciones', i.id]"><span class="grande"><strong>{{ i.titulo }}</strong><small>{{ i.doctor.nombre }} · {{ dia(i.createdAt) }}{{ i.fechaFin ? ' · hasta ' + fecha(i.fechaFin) : '' }}</small></span><app-chip [estado]="i.estado" />@if (i.tienePauta) { <app-chip etiqueta="Con pauta" color="info" /> }<mat-icon>chevron_right</mat-icon></a></li>
        }
      </ul>
    </app-estado>
  `,
  styles: `.barra { margin-bottom: .75rem; } a.item { text-decoration: none; color: inherit; flex-wrap: wrap; }`,
})
export class TabIndicaciones extends Pestana {
  protected readonly lista = signal<any[]>([]);
  constructor() {
    super();
    effect(() => {
      this.pacienteId();
      this.cargar();
    });
  }
  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any>(`/ficha/${this.pacienteId()}/indicaciones`, { tamano: 100 }).subscribe({
      next: (r) => {
        this.lista.set(r.items);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}

// ───────────────────────── Signos vitales ─────────────────────────

/** Serie de signos vitales con gráfico (presión, peso e IMC) y tabla. */
@Component({
  selector: 'app-tab-signos',
  imports: [Estado, BaseChartDirective],
  providers: [provideCharts({ registerables: [LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend] })],
  template: `
    <app-estado [cargando]="cargando()" [error]="error()" [vacio]="serie().length === 0" mensaje="Todavía no hay signos vitales registrados en atenciones cerradas." icono="monitor_heart" (reintento)="cargar()">
      <div class="graficos">
        <section class="tarjeta"><h3>Presión arterial (mmHg)</h3><div class="caja"><canvas baseChart [data]="presion()" [type]="'line'" [options]="opciones"></canvas></div></section>
        <section class="tarjeta"><h3>Peso (kg) e IMC</h3><div class="caja"><canvas baseChart [data]="peso()" [type]="'line'" [options]="opciones"></canvas></div></section>
      </div>
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Presión</th><th>FC</th><th>FR</th><th>Temp.</th><th>Sat.</th><th>Peso</th><th>Talla</th><th>IMC</th></tr></thead>
          <tbody>@for (s of serie(); track s.atencionId) { <tr><td>{{ hora(s.fecha) }}</td><td>{{ s.paSistolica ?? '–' }}/{{ s.paDiastolica ?? '–' }}</td><td>{{ s.frecuenciaCardiaca ?? '–' }}</td><td>{{ s.frecuenciaRespiratoria ?? '–' }}</td><td>{{ s.temperatura ?? '–' }}</td><td>{{ s.saturacion ?? '–' }}</td><td>{{ s.pesoKg ?? '–' }}</td><td>{{ s.tallaCm ?? '–' }}</td><td>{{ s.imc ?? '–' }}</td></tr> }</tbody>
        </table>
      </div>
    </app-estado>
  `,
  styles: `.graficos { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); margin-bottom: 1rem; } .caja { height: 240px; position: relative; }`,
})
export class TabSignos extends Pestana {
  protected readonly serie = signal<any[]>([]);
  protected readonly presion = signal<ChartConfiguration<'line'>['data']>({ labels: [], datasets: [] });
  protected readonly peso = signal<ChartConfiguration<'line'>['data']>({ labels: [], datasets: [] });
  protected readonly opciones: ChartConfiguration<'line'>['options'] = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };

  constructor() {
    super();
    Chart.defaults.font.family = 'Atkinson Hyperlegible Next Variable, system-ui, sans-serif';
    effect(() => {
      this.pacienteId();
      this.cargar();
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any[]>(`/ficha/${this.pacienteId()}/signos`).subscribe({
      next: (r) => {
        this.serie.set(r);
        const etiquetas = r.map((s) => fechaCorta(fechaLocal(s.fecha)));
        const primario = colorTema('--mat-sys-primary') || '#0a4e99';
        const sec = colorTema('--mat-sys-tertiary') || '#0b8794';
        this.presion.set({ labels: etiquetas, datasets: [
          { label: 'Sistólica', data: r.map((s) => s.paSistolica), borderColor: primario, backgroundColor: primario, spanGaps: true },
          { label: 'Diastólica', data: r.map((s) => s.paDiastolica), borderColor: sec, backgroundColor: sec, spanGaps: true },
        ] });
        this.peso.set({ labels: etiquetas, datasets: [
          { label: 'Peso (kg)', data: r.map((s) => s.pesoKg), borderColor: primario, backgroundColor: primario, spanGaps: true },
          { label: 'IMC', data: r.map((s) => s.imc), borderColor: sec, backgroundColor: sec, spanGaps: true },
        ] });
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}
