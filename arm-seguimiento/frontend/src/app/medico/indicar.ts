import { Component, computed, effect, inject, input, numberAttribute, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaCorta, hoyIso } from '../core/fechas';
import { TIPOS } from '../core/models';
import { Estado, Pagina } from '../shared/piezas';

type Modo = 'CADA_N_HORAS' | 'HORAS_FIJAS' | 'SEGUN_NECESIDAD';

interface Toma {
  instante: string;
  fecha: string;
  hora: string;
}

const DIAS = [
  { n: 1, corto: 'Lun', largo: 'lunes' },
  { n: 2, corto: 'Mar', largo: 'martes' },
  { n: 3, corto: 'Mié', largo: 'miércoles' },
  { n: 4, corto: 'Jue', largo: 'jueves' },
  { n: 5, corto: 'Vie', largo: 'viernes' },
  { n: 6, corto: 'Sáb', largo: 'sábado' },
  { n: 7, corto: 'Dom', largo: 'domingo' },
];

/**
 * Asistente para emitir una indicación o para modificar su pauta, en tres pasos: qué se indica, cuándo y revisión.
 * Todo lo escribe el médico: la aplicación no propone medicamentos, dosis, vías, frecuencias ni duraciones. Antes de emitir
 * muestra las tomas exactas que se generarían en el calendario del paciente.
 */
@Component({
  selector: 'app-indicar',
  imports: [Pagina, Estado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <app-pagina [titulo]="modificar ? 'Modificar la pauta' : 'Nueva indicación'" [subtitulo]="paciente()" [volver]="true">
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="iniciar()">
        @if (alergias()) { <p class="alergia" role="note"><mat-icon>warning</mat-icon><span><strong>Alergias del paciente:</strong> {{ alergias() }}</span></p> }
        @if (modificar) { <p class="aviso"><mat-icon>info</mat-icon> Se crea una versión nueva. Las tomas ya pasadas o marcadas no cambian; las pendientes de la pauta anterior se anulan y se generan las nuevas desde ahora.</p> }

        <ol class="pasos" aria-label="Pasos">
          @for (p of pasosNombre; track p; let i = $index) { <li [class.activo]="paso() === i + 1" [class.hecho]="paso() > i + 1" [attr.aria-current]="paso() === i + 1 ? 'step' : null"><span>{{ i + 1 }}</span> {{ p }}</li> }
        </ol>

        <form [formGroup]="f" (ngSubmit)="$event.preventDefault()" novalidate>
          @if (paso() === 1) {
            <section class="tarjeta campos">
              @if (!modificar) {
                <mat-form-field><mat-label>Tipo de indicación</mat-label>
                  <mat-select formControlName="tipo">@for (t of tipos; track t.valor) { <mat-option [value]="t.valor">{{ t.etiqueta }}</mat-option> }</mat-select></mat-form-field>
                <mat-form-field class="ancho"><mat-label>Título</mat-label><input matInput formControlName="titulo" maxlength="150" autocomplete="off" /><mat-hint>Resumen corto, por ejemplo «Amoxicilina por 7 días».</mat-hint><mat-error>Escriba un título de al menos 3 caracteres.</mat-error></mat-form-field>
                <mat-form-field class="ancho"><mat-label>Instrucciones para el paciente</mat-label><textarea matInput rows="4" formControlName="descripcion" maxlength="2000"></textarea><mat-hint>Lo que el paciente verá, en palabras simples.</mat-hint><mat-error>Escriba las instrucciones (al menos 5 caracteres).</mat-error></mat-form-field>
              }
              @if (esMedicamento()) {
                <mat-form-field><mat-label>Medicamento</mat-label><input matInput formControlName="medicamento" maxlength="120" autocomplete="off" /><mat-error>Escriba el nombre del medicamento.</mat-error></mat-form-field>
                <mat-form-field><mat-label>Presentación (opcional)</mat-label><input matInput formControlName="presentacion" maxlength="80" autocomplete="off" /></mat-form-field>
                <mat-form-field><mat-label>Dosis</mat-label><input matInput formControlName="dosis" maxlength="80" autocomplete="off" /><mat-error>Escriba la dosis.</mat-error></mat-form-field>
                <mat-form-field><mat-label>Vía</mat-label><input matInput formControlName="via" maxlength="40" autocomplete="off" /><mat-error>Escriba la vía.</mat-error></mat-form-field>
              }
              @if (modificar && !esMedicamento()) { <p class="muted ancho">Esta indicación no es un medicamento: solo cambia la pauta en el paso siguiente.</p> }
            </section>
          }

          @if (paso() === 2) {
            <section class="tarjeta campos">
              @if (admitePauta()) {
                @if (!modificar) {
                  <mat-form-field><mat-label>¿Tiene horario?</mat-label>
                    <mat-select formControlName="conPauta"><mat-option [value]="true">Sí, con tomas en el calendario</mat-option><mat-option [value]="false">No, es una indicación general</mat-option></mat-select></mat-form-field>
                }
              } @else { <p class="muted ancho">Este tipo de indicación no lleva horario: solo se define desde cuándo y hasta cuándo rige.</p> }

              @if (usaPauta()) {
                <mat-form-field><mat-label>Cómo se reparten las tomas</mat-label>
                  <mat-select formControlName="modo"><mat-option value="CADA_N_HORAS">Cada cierto número de horas</mat-option><mat-option value="HORAS_FIJAS">A horas fijas del día</mat-option><mat-option value="SEGUN_NECESIDAD">Solo si hace falta</mat-option></mat-select><mat-error>Elija una opción.</mat-error></mat-form-field>

                @if (f.value.modo === 'CADA_N_HORAS') {
                  <mat-form-field><mat-label>Cada cuántas horas (1 a 72)</mat-label><input matInput type="number" inputmode="numeric" formControlName="intervaloHoras" min="1" max="72" /><mat-error>Indique de 1 a 72 horas.</mat-error></mat-form-field>
                }
                @if (f.value.modo === 'HORAS_FIJAS') {
                  <div class="ancho horas">
                    <span class="etiqueta">Horas del día</span>
                    @for (h of horas(); track $index) {
                      <span class="hora-fila"><input class="hora-input" type="time" [value]="h" (input)="cambiarHora($index, $any($event.target).value)" [attr.aria-label]="'Hora ' + ($index + 1)" />
                        @if (horas().length > 1) { <button mat-icon-button type="button" (click)="quitarHora($index)" [attr.aria-label]="'Quitar hora ' + ($index + 1)"><mat-icon>close</mat-icon></button> }</span>
                    }
                    @if (horas().length < 12) { <button mat-stroked-button type="button" (click)="agregarHora()"><mat-icon>add</mat-icon> Agregar hora</button> }
                    @if (intentoPaso2() && horasInvalidas()) { <span class="error-texto" role="alert">{{ horasInvalidas() }}</span> }
                  </div>
                }

                @if (f.value.modo === 'CADA_N_HORAS' || f.value.modo === 'HORAS_FIJAS') {
                  <mat-form-field><mat-label>Primera toma: fecha</mat-label><input matInput type="date" formControlName="inicioFecha" /><mat-error>Indique la fecha.</mat-error></mat-form-field>
                  <mat-form-field><mat-label>Primera toma: hora</mat-label><input matInput type="time" formControlName="inicioHora" /><mat-error>Indique la hora.</mat-error></mat-form-field>
                  <mat-form-field><mat-label>Duración en días (1 a 365)</mat-label><input matInput type="number" inputmode="numeric" formControlName="duracionDias" min="1" max="365" /><mat-error>Indique de 1 a 365 días.</mat-error></mat-form-field>
                  <div class="ancho">
                    <span class="etiqueta">Días de la semana <small class="muted">(sin elegir ninguno: todos los días)</small></span>
                    <div class="dias" role="group" aria-label="Días de la semana">
                      @for (d of dias; track d.n) { <button type="button" class="dia" [class.activo]="diasSel().includes(d.n)" [attr.aria-pressed]="diasSel().includes(d.n)" [attr.aria-label]="d.largo" (click)="alternarDia(d.n)">{{ d.corto }}</button> }
                    </div>
                  </div>
                }
              }

              @if (!usaPauta() || f.value.modo === 'SEGUN_NECESIDAD') {
                @if (!modificar) {
                  <mat-form-field><mat-label>Rige desde</mat-label><input matInput type="date" formControlName="fechaInicio" /><mat-error>Indique la fecha.</mat-error></mat-form-field>
                  <mat-form-field><mat-label>Hasta (opcional)</mat-label><input matInput type="date" formControlName="fechaFin" /></mat-form-field>
                }
              }
            </section>
          }

          @if (paso() === 3) {
            <section class="tarjeta">
              <h2>Revise antes de emitir</h2>
              <dl class="resumen">
                @if (!modificar) { <dt>Indicación</dt><dd>{{ tipoNombre() }}: <strong>{{ f.value.titulo }}</strong></dd><dd class="texto">{{ f.value.descripcion }}</dd> }
                @if (esMedicamento()) { <dt>Medicamento</dt><dd>{{ f.value.medicamento }}{{ f.value.presentacion ? ' · ' + f.value.presentacion : '' }} · {{ f.value.dosis }} · {{ f.value.via }}</dd> }
                <dt>Horario</dt><dd>{{ descripcionPauta() }}</dd>
              </dl>

              @if (usaPauta() && f.value.modo !== 'SEGUN_NECESIDAD') {
                <h3>Tomas que se agregarán al calendario del paciente</h3>
                <app-estado [cargando]="calculando()" [error]="errorPrevia()" [reintentable]="false">
                  @if (previa(); as p) {
                    <p><strong>{{ p.total }}</strong> tomas en total{{ p.truncado ? ' (se muestran las primeras 500)' : '' }}.</p>
                    <ul class="previa">@for (g of grupos(); track g.fecha) { <li><strong>{{ g.etiqueta }}</strong>: {{ g.horas.join(' · ') }}</li> }</ul>
                  }
                </app-estado>
              }

              @if (modificar) {
                <mat-form-field class="ancho"><mat-label>Motivo del cambio</mat-label><input matInput formControlName="motivo" maxlength="200" /><mat-hint>Queda en el historial de versiones.</mat-hint><mat-error>Indique el motivo (al menos 3 caracteres).</mat-error></mat-form-field>
              }
              <p class="muted">Esta indicación no reemplaza la receta médica. Al emitirla, el paciente recibe un aviso.</p>
            </section>
          }

          <div class="botones">
            @if (paso() > 1) { <button mat-stroked-button type="button" (click)="atras()"><mat-icon>arrow_back</mat-icon> Atrás</button> }
            @if (paso() < 3) { <button mat-flat-button type="button" (click)="siguiente()">Siguiente</button> }
            @else { <button mat-flat-button type="button" (click)="emitir()" [disabled]="enviando()"><mat-icon>send</mat-icon> {{ modificar ? 'Guardar nueva versión' : 'Emitir indicación' }}</button> }
          </div>
        </form>
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .alergia { display: flex; gap: .5rem; align-items: center; margin: 0 0 1rem; }
    .pasos { display: flex; gap: .5rem; list-style: none; padding: 0; margin: 0 0 1rem; flex-wrap: wrap; }
    .pasos li { display: flex; align-items: center; gap: .4rem; color: var(--mat-sys-on-surface-variant); padding: .25rem .75rem .25rem .25rem; border-radius: 999px; }
    .pasos li span { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--mat-sys-surface-container-high); font-weight: 700; }
    .pasos li.activo { color: var(--mat-sys-on-surface); font-weight: 600; } .pasos li.activo span, .pasos li.hecho span { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); }
    .horas { display: grid; gap: .5rem; justify-items: start; } .hora-fila { display: inline-flex; align-items: center; gap: .25rem; }
    .hora-input { font: inherit; padding: .6rem .75rem; border: 1px solid var(--mat-sys-outline); border-radius: 8px; background: var(--mat-sys-surface); color: inherit; min-height: 48px; }
    .etiqueta { display: block; font: var(--mat-sys-label-large); margin-bottom: .25rem; } .error-texto { color: var(--mat-sys-error); font: var(--mat-sys-body-small); }
    .dias { display: flex; gap: .4rem; flex-wrap: wrap; }
    .dia { min-width: 3rem; min-height: 44px; border-radius: 999px; border: 1px solid var(--mat-sys-outline); background: var(--mat-sys-surface); color: inherit; font: inherit; cursor: pointer; }
    .dia.activo { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); border-color: var(--mat-sys-primary); }
    .resumen { display: grid; gap: .25rem; margin: 0 0 1rem; } .resumen dt { font: var(--mat-sys-label-large); color: var(--mat-sys-on-surface-variant); margin-top: .5rem; } .resumen dd { margin: 0; } .texto { white-space: pre-line; }
    .previa { list-style: none; padding: 0; margin: 0 0 1rem; display: grid; gap: .25rem; max-height: 22rem; overflow: auto; }
    .botones { display: flex; gap: .75rem; justify-content: flex-end; margin-top: 1rem; flex-wrap: wrap; }
  `,
})
export class Indicar {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Paciente (al crear) o indicación (al modificar su pauta), según la ruta. */
  readonly id = input.required({ transform: numberAttribute });
  /** Atención de la que nace la indicación, si viene de una. */
  readonly atencion = input<string>();
  /** `true` cuando la ruta es «modificar la pauta» de una indicación existente. */
  protected readonly modificar = !!inject(ActivatedRoute).snapshot.data['modificar'];

  protected readonly tipos = TIPOS;
  protected readonly dias = DIAS;
  protected readonly pasosNombre = ['Qué se indica', 'Cuándo', 'Revisar'];
  protected readonly paso = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly paciente = signal('');
  protected readonly alergias = signal('');
  protected readonly enviando = signal(false);
  protected readonly calculando = signal(false);
  protected readonly errorPrevia = signal<string | null>(null);
  protected readonly previa = signal<{ total: number; tomas: Toma[]; truncado: boolean } | null>(null);
  protected readonly intentoPaso2 = signal(false);
  protected readonly horas = signal<string[]>(['']);
  protected readonly diasSel = signal<number[]>([]);
  private pacienteId = 0;

  protected readonly f = this.fb.group({
    tipo: ['MEDICAMENTO'],
    titulo: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    descripcion: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(2000)]],
    medicamento: [''],
    presentacion: [''],
    dosis: [''],
    via: [''],
    conPauta: [true],
    modo: ['' as Modo | ''],
    intervaloHoras: this.fb.control<number | null>(null),
    inicioFecha: [hoyIso()],
    inicioHora: [''],
    duracionDias: this.fb.control<number | null>(null),
    fechaInicio: [hoyIso()],
    fechaFin: [''],
    motivo: [''],
  });

  protected readonly tipoActual = signal('MEDICAMENTO');
  protected readonly esMedicamento = computed(() => this.tipoActual() === 'MEDICAMENTO');
  protected readonly admitePauta = computed(() => this.tipoActual() === 'MEDICAMENTO' || this.tipoActual() === 'RUTINA');
  protected readonly conPauta = signal(true);
  protected readonly usaPauta = computed(() => this.admitePauta() && this.conPauta());
  protected readonly tipoNombre = () => TIPOS.find((t) => t.valor === this.f.value.tipo)?.etiqueta ?? '';

  constructor() {
    this.f.controls.tipo.valueChanges.subscribe((t) => this.tipoActual.set(t));
    this.f.controls.conPauta.valueChanges.subscribe((v) => this.conPauta.set(v));
    effect(() => {
      this.id();
      untracked(() => this.iniciar());
    });
  }

  protected iniciar(): void {
    this.cargando.set(true);
    if (this.modificar) {
      this.api.get<any>(`/recomendaciones/${this.id()}`).subscribe({
        next: (r) => {
          this.pacienteId = r.paciente.id;
          this.paciente.set(`${r.paciente.nombre} · ${r.titulo}`);
          this.tipoActual.set(r.tipo);
          this.f.patchValue({ tipo: r.tipo, titulo: r.titulo, descripcion: r.descripcion, medicamento: r.medicamento ?? '', presentacion: r.presentacion ?? '', dosis: r.dosis ?? '', via: r.via ?? '' }, { emitEvent: false });
          const p = r.pautaVigente;
          if (p) {
            const [fecha, hora] = (p.inicioLocal as string).split(' ');
            this.f.patchValue({ modo: p.modo, intervaloHoras: p.intervaloHoras, inicioFecha: fecha, inicioHora: hora, duracionDias: p.duracionDias }, { emitEvent: false });
            this.horas.set(p.horasLocales?.length ? p.horasLocales : ['']);
            this.diasSel.set(p.diasSemana ?? []);
          }
          this.conPauta.set(true);
          this.f.controls.motivo.addValidators([Validators.required, Validators.minLength(3)]);
          this.cargarAlergias();
        },
        error: (e: unknown) => this.fallar(e),
      });
    } else {
      this.pacienteId = this.id();
      this.cargarAlergias();
    }
  }

  private cargarAlergias(): void {
    this.api.get<any>(`/ficha/${this.pacienteId}`).subscribe({
      next: (r) => {
        if (!this.modificar) this.paciente.set(`${r.identificacion.nombre} · RUT ${r.identificacion.rut}`);
        this.alergias.set((r.alergias ?? []).map((a: any) => `${a.descripcion}${a.severidad ? ' (' + a.severidad.toLowerCase() + ')' : ''}`).join(' · '));
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => this.fallar(e),
    });
  }

  private fallar(e: unknown): void {
    this.error.set(mensajeError(e));
    this.cargando.set(false);
  }

  // ── Horas y días ──

  protected cambiarHora(i: number, v: string): void {
    this.horas.update((h) => h.map((x, j) => (j === i ? v : x)));
  }
  protected agregarHora(): void {
    this.horas.update((h) => [...h, '']);
  }
  protected quitarHora(i: number): void {
    this.horas.update((h) => h.filter((_, j) => j !== i));
  }
  protected alternarDia(n: number): void {
    this.diasSel.update((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()));
  }

  protected horasInvalidas(): string | null {
    const h = this.horas();
    if (h.some((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) return 'Complete todas las horas.';
    if (new Set(h).size !== h.length) return 'Hay horas repetidas.';
    return null;
  }

  // ── Pasos ──

  protected atras(): void {
    this.paso.update((p) => p - 1);
  }

  protected siguiente(): void {
    if (this.paso() === 1 && !this.validarPaso1()) return;
    if (this.paso() === 2) {
      if (!this.validarPaso2()) return;
      this.paso.set(3);
      void this.calcularPrevia();
      return;
    }
    this.paso.update((p) => p + 1);
  }

  private exigir(nombres: string[], requerido: boolean): boolean {
    let ok = true;
    for (const n of nombres) {
      const c = this.f.get(n)!;
      if (requerido) c.addValidators(Validators.required);
      c.updateValueAndValidity({ emitEvent: false });
      c.markAsTouched();
      if (c.invalid) ok = false;
      if (requerido) c.removeValidators(Validators.required);
    }
    return ok;
  }

  private validarPaso1(): boolean {
    const base = this.modificar ? true : this.exigir(['titulo', 'descripcion'], false);
    const med = this.esMedicamento() ? this.exigir(['medicamento', 'dosis', 'via'], true) : true;
    return base && med;
  }

  private validarPaso2(): boolean {
    this.intentoPaso2.set(true);
    if (this.usaPauta()) {
      const modo = this.f.value.modo;
      if (!this.exigir(['modo'], true)) return false;
      if (modo === 'SEGUN_NECESIDAD') return this.exigir(['fechaInicio'], !this.modificar);
      let ok = true;
      if (modo === 'CADA_N_HORAS') {
        const c = this.f.controls.intervaloHoras;
        const v = Number(c.value);
        if (!Number.isInteger(v) || v < 1 || v > 72) {
          c.setErrors({ intervalo: true });
          c.markAsTouched();
          ok = false;
        }
      }
      if (modo === 'HORAS_FIJAS' && this.horasInvalidas()) ok = false;
      const d = Number(this.f.controls.duracionDias.value);
      if (!Number.isInteger(d) || d < 1 || d > 365) {
        this.f.controls.duracionDias.setErrors({ duracion: true });
        this.f.controls.duracionDias.markAsTouched();
        ok = false;
      }
      if (!this.exigir(['inicioFecha', 'inicioHora'], true)) ok = false;
      return ok;
    }
    return this.exigir(['fechaInicio'], true);
  }

  // ── Vista previa y emisión ──

  /** Arma la pauta tal como la espera el servidor. */
  private pauta(): Record<string, unknown> | null {
    if (!this.usaPauta()) return null;
    const v = this.f.getRawValue();
    const modo = v.modo as Modo;
    if (modo === 'SEGUN_NECESIDAD') {
      const inicio = v.fechaInicio || hoyIso();
      const dias = v.fechaFin ? Math.min(365, Math.max(1, Math.round((Date.parse(v.fechaFin) - Date.parse(inicio)) / 86_400_000) + 1)) : 365;
      return { modo, inicioLocal: `${inicio} 00:00`, duracionDias: dias };
    }
    const p: Record<string, unknown> = { modo, inicioLocal: `${v.inicioFecha} ${v.inicioHora}`, duracionDias: Number(v.duracionDias) };
    if (modo === 'CADA_N_HORAS') p['intervaloHoras'] = Number(v.intervaloHoras);
    if (modo === 'HORAS_FIJAS') p['horasLocales'] = this.horas();
    if (this.diasSel().length > 0) p['diasSemana'] = this.diasSel();
    return p;
  }

  private async calcularPrevia(): Promise<void> {
    this.previa.set(null);
    this.errorPrevia.set(null);
    const pauta = this.pauta();
    if (!pauta || pauta['modo'] === 'SEGUN_NECESIDAD') return;
    this.calculando.set(true);
    this.api.post<{ total: number; tomas: Toma[]; truncado: boolean }>('/recomendaciones/vista-previa', { pauta }).subscribe({
      next: (r) => {
        this.previa.set(r);
        this.calculando.set(false);
      },
      error: (e: unknown) => {
        this.errorPrevia.set(mensajeError(e));
        this.calculando.set(false);
      },
    });
  }

  /** Las tomas agrupadas por día, para leerlas de un vistazo. */
  protected readonly grupos = computed(() => {
    const mapa = new Map<string, string[]>();
    for (const t of this.previa()?.tomas ?? []) mapa.set(t.fecha, [...(mapa.get(t.fecha) ?? []), t.hora]);
    return [...mapa.entries()].map(([fecha, horas]) => ({ fecha, etiqueta: fechaCorta(fecha), horas }));
  });

  protected descripcionPauta(): string {
    if (!this.usaPauta()) {
      const v = this.f.value;
      return `Indicación general · desde ${fechaCorta(v.fechaInicio || hoyIso())}${v.fechaFin ? ' hasta ' + fechaCorta(v.fechaFin) : ''}`;
    }
    const v = this.f.getRawValue();
    const dias = this.diasSel().length ? ` · ${this.diasSel().map((n) => DIAS[n - 1].largo).join(', ')}` : ' · todos los días';
    if (v.modo === 'SEGUN_NECESIDAD') return `Solo si hace falta (no genera tomas ni recordatorios) · desde ${fechaCorta(v.fechaInicio || hoyIso())}${v.fechaFin ? ' hasta ' + fechaCorta(v.fechaFin) : ''}`;
    const cuando = v.modo === 'CADA_N_HORAS' ? `cada ${v.intervaloHoras} horas` : `a las ${this.horas().join(', ')}`;
    return `${cuando} · ${v.duracionDias} días · desde ${fechaCorta(v.inicioFecha)} a las ${v.inicioHora}${dias}`;
  }

  protected emitir(): void {
    if (this.modificar) {
      this.f.controls.motivo.markAsTouched();
      if (this.f.controls.motivo.invalid) return;
    }
    const v = this.f.getRawValue();
    const med: Record<string, string> = {};
    if (this.esMedicamento()) {
      med['medicamento'] = v.medicamento;
      med['dosis'] = v.dosis;
      med['via'] = v.via;
      if (v.presentacion) med['presentacion'] = v.presentacion;
    }
    this.enviando.set(true);
    const pauta = this.pauta();
    const destino = (idRec: number) => void this.router.navigate(['/medico/indicaciones', idRec], { replaceUrl: true });
    const fallo = (e: unknown) => {
      this.enviando.set(false);
      this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
    };
    if (this.modificar) {
      this.api.put<{ id: number }>(`/recomendaciones/${this.id()}/pauta`, { ...med, pauta, motivo: v.motivo }).subscribe({ next: (r) => destino(r.id), error: fallo });
      return;
    }
    const cuerpo: Record<string, unknown> = { pacienteId: this.pacienteId, tipo: v.tipo, titulo: v.titulo, descripcion: v.descripcion, ...med };
    if (this.atencion()) cuerpo['atencionId'] = Number(this.atencion());
    if (pauta) cuerpo['pauta'] = pauta;
    if (!pauta || pauta['modo'] === 'SEGUN_NECESIDAD') {
      cuerpo['fechaInicio'] = v.fechaInicio || hoyIso();
      if (v.fechaFin) cuerpo['fechaFin'] = v.fechaFin;
    }
    this.api.post<{ id: number }>('/recomendaciones', cuerpo).subscribe({ next: (r) => destino(r.id), error: fallo });
  }
}
