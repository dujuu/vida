import { Component, DestroyRef, computed, effect, inject, input, numberAttribute, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { fechaCorta, fechaHora, fechaLocal, horaLocal } from '../core/fechas';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, confirmar, guardarArchivo } from '../shared/piezas';

/** Aviso de alergias vigentes del paciente, para tenerlas a la vista mientras se escribe. */
const textoAlergias = (r: any): string => (r?.alergias ?? []).map((a: any) => `${a.descripcion}${a.severidad ? ' (' + a.severidad.toLowerCase() + ')' : ''}`).join(' · ');

// ───────────────────────── Nueva atención ─────────────────────────

/**
 * Abre una atención en borrador. Pide solo el motivo de consulta; el resto se escribe en el editor, que guarda solo.
 * Llega aquí desde una cita (`?paciente=&cita=`) o desde la ficha (`?paciente=`).
 */
@Component({
  selector: 'app-atencion-nueva',
  imports: [Pagina, Estado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Nueva atención" [subtitulo]="nombre()" [volver]="true">
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargarPaciente()">
        @if (alergias()) { <p class="alergia" role="note"><mat-icon>warning</mat-icon><span><strong>Alergias:</strong> {{ alergias() }}</span></p> }
        <form class="tarjeta campos" [formGroup]="form" (ngSubmit)="crear()" novalidate>
          <mat-form-field class="ancho">
            <mat-label>Motivo de consulta</mat-label>
            <input matInput formControlName="motivo" maxlength="300" autocomplete="off" />
            <mat-error>Escriba el motivo (al menos 3 caracteres).</mat-error>
          </mat-form-field>
          <p class="muted ancho">Se abre como borrador: se guarda solo mientras escribe y solo usted lo ve hasta que lo cierre.</p>
          <div class="ancho acciones-fila"><button mat-flat-button type="submit" [disabled]="enviando()">Comenzar atención</button></div>
        </form>
      </app-estado>
    </app-pagina>
  `,
  styles: `.alergia { display: flex; gap: .5rem; align-items: center; margin: 0 0 1rem; }`,
})
export class AtencionNueva {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  readonly paciente = input<string>();
  readonly cita = input<string>();
  protected readonly form = inject(NonNullableFormBuilder).group({ motivo: ['', [Validators.required, Validators.minLength(3)]] });
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly nombre = signal('');
  protected readonly alergias = signal('');

  constructor() {
    effect(() => {
      if (this.paciente()) this.cargarPaciente();
    });
  }

  protected cargarPaciente(): void {
    this.cargando.set(true);
    this.api.get<any>(`/ficha/${this.paciente()}`).subscribe({
      next: (r) => {
        this.nombre.set(`${r.identificacion.nombre} · RUT ${r.identificacion.rut}`);
        this.alergias.set(textoAlergias(r));
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected crear(): void {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.enviando.set(true);
    const cuerpo: Record<string, unknown> = { pacienteId: Number(this.paciente()), motivo: this.form.getRawValue().motivo };
    if (this.cita()) cuerpo['citaId'] = Number(this.cita());
    this.api.post<{ id: number }>('/atenciones', cuerpo).subscribe({
      next: (a) => void this.router.navigate(['/medico/atencion', a.id], { replaceUrl: true }),
      error: (e: { status?: number; error?: { atencionId?: number } }) => {
        this.enviando.set(false);
        // Ya existía una atención para esa cita: se continúa con ella.
        if (e.status === 409 && e.error?.atencionId) void this.router.navigate(['/medico/atencion', e.error.atencionId], { replaceUrl: true });
        else this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
      },
    });
  }
}

// ───────────────────────── Editor de atención ─────────────────────────

type EstadoGuardado = 'limpio' | 'pendiente' | 'guardando' | 'guardado' | 'error' | 'motivo';

/**
 * Atención clínica. Mientras es borrador se edita y guarda sola cada pocos segundos; al cerrarla queda inmutable y solo admite
 * enmiendas con motivo, que se agregan sin borrar el texto original.
 */
@Component({
  selector: 'app-atencion-editor',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <app-pagina titulo="Atención" [subtitulo]="subtitulo()" [volver]="true">
      <div acciones class="fila">
        @if (a(); as x) {
          <app-chip [estado]="x.estado" />
          <a mat-stroked-button [routerLink]="['/medico/pacientes', x.pacienteId]"><mat-icon>folder_shared</mat-icon> Ficha</a>
          @if (!soloLectura()) { <button mat-flat-button type="button" (click)="cerrar()" [disabled]="cerrando()"><mat-icon>lock</mat-icon> Cerrar atención</button> }
        }
      </div>

      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (a(); as x) {
          @if (alergias()) { <p class="alergia" role="note"><mat-icon>warning</mat-icon><span><strong>Alergias:</strong> {{ alergias() }}</span></p> }
          @if (x.estado === 'CERRADA') { <p class="aviso"><mat-icon>lock</mat-icon> Atención cerrada el {{ hora(x.cerradaEn) }}. No se puede editar; las correcciones se agregan como enmiendas.</p> }

          @if (!soloLectura()) {
            <div class="guardado" aria-live="polite">
              @switch (guardado()) {
                @case ('guardando') { <span>Guardando…</span> }
                @case ('guardado') { <span><mat-icon>cloud_done</mat-icon> Guardado a las {{ ultimoGuardado() }}</span> }
                @case ('pendiente') { <span>Cambios sin guardar…</span> }
                @case ('motivo') { <span class="malo">Escriba el motivo de consulta para poder guardar.</span> }
                @case ('error') { <span class="malo">No se pudo guardar. Se reintentará al seguir escribiendo.</span> }
              }
            </div>
          }

          <form [formGroup]="form" class="secciones" novalidate>
            <section class="tarjeta">
              <h2>Motivo y anamnesis</h2>
              @if (soloLectura()) {
                <p><strong>Motivo:</strong> {{ x.motivo }}</p>
                @if (x.anamnesis) { <p class="texto">{{ x.anamnesis }}</p> }
              } @else {
                <mat-form-field class="ancho"><mat-label>Motivo de consulta</mat-label><input matInput formControlName="motivo" maxlength="300" /><mat-error>Escriba el motivo (al menos 3 caracteres).</mat-error></mat-form-field>
                <mat-form-field class="ancho"><mat-label>Anamnesis</mat-label><textarea matInput rows="5" formControlName="anamnesis" maxlength="10000"></textarea></mat-form-field>
              }
            </section>

            <section class="tarjeta">
              <h2>Examen físico</h2>
              @if (soloLectura()) { <p class="texto">{{ x.examenFisico || 'Sin registro.' }}</p> }
              @else { <mat-form-field class="ancho"><mat-label>Examen físico</mat-label><textarea matInput rows="4" formControlName="examenFisico" maxlength="10000"></textarea></mat-form-field> }
            </section>
          </form>

          <section class="tarjeta">
            <h2>Signos vitales</h2>
            @if (soloLectura()) {
              @if (x.signosVitales; as s) {
                <p>PA {{ s.paSistolica ?? '–' }}/{{ s.paDiastolica ?? '–' }} mmHg · FC {{ s.frecuenciaCardiaca ?? '–' }} · FR {{ s.frecuenciaRespiratoria ?? '–' }} · T° {{ s.temperatura ?? '–' }} °C · Sat {{ s.saturacion ?? '–' }} % · Peso {{ s.pesoKg ?? '–' }} kg · Talla {{ s.tallaCm ?? '–' }} cm @if (s.imc) { · IMC {{ s.imc }} }</p>
              } @else { <p class="muted">Sin signos vitales.</p> }
            } @else {
              <form [formGroup]="signos" (ngSubmit)="guardarSignos()" class="campos rejilla-4" novalidate>
                <mat-form-field><mat-label>Presión sistólica (mmHg)</mat-label><input matInput type="number" inputmode="numeric" formControlName="paSistolica" /></mat-form-field>
                <mat-form-field><mat-label>Presión diastólica (mmHg)</mat-label><input matInput type="number" inputmode="numeric" formControlName="paDiastolica" /></mat-form-field>
                <mat-form-field><mat-label>Frec. cardíaca (lpm)</mat-label><input matInput type="number" inputmode="numeric" formControlName="frecuenciaCardiaca" /></mat-form-field>
                <mat-form-field><mat-label>Frec. respiratoria (rpm)</mat-label><input matInput type="number" inputmode="numeric" formControlName="frecuenciaRespiratoria" /></mat-form-field>
                <mat-form-field><mat-label>Temperatura (°C)</mat-label><input matInput type="number" inputmode="decimal" step="0.1" formControlName="temperatura" /></mat-form-field>
                <mat-form-field><mat-label>Saturación (%)</mat-label><input matInput type="number" inputmode="numeric" formControlName="saturacion" /></mat-form-field>
                <mat-form-field><mat-label>Peso (kg)</mat-label><input matInput type="number" inputmode="decimal" step="0.1" formControlName="pesoKg" /></mat-form-field>
                <mat-form-field><mat-label>Talla (cm)</mat-label><input matInput type="number" inputmode="decimal" step="0.1" formControlName="tallaCm" /></mat-form-field>
                <div class="ancho acciones-fila"><button mat-stroked-button type="submit" [disabled]="guardandoSignos()">Guardar signos vitales</button>@if (imc()) { <span class="muted">IMC calculado: <strong>{{ imc() }}</strong></span> }</div>
              </form>
            }
          </section>

          <section class="tarjeta">
            <h2>Diagnósticos de esta atención</h2>
            <ul class="simple">@for (d of x.diagnosticos; track d.id) { <li>{{ d.descripcion }} {{ d.codigoCie10 ? '(' + d.codigoCie10 + ')' : '' }} <app-chip [estado]="d.estado" /></li> } @empty { <li class="muted">Ninguno registrado.</li> }</ul>
            @if (!soloLectura()) {
              <form [formGroup]="dx" (ngSubmit)="agregarDx()" class="campos fila-agregar" novalidate>
                <mat-form-field class="crece"><mat-label>Diagnóstico</mat-label><input matInput formControlName="descripcion" maxlength="300" /></mat-form-field>
                <mat-form-field class="corto"><mat-label>CIE-10 (opcional)</mat-label><input matInput formControlName="codigoCie10" placeholder="J06.9" /><mat-error>Formato como J06.9</mat-error></mat-form-field>
                <button mat-stroked-button type="submit">Agregar</button>
              </form>
            }
          </section>

          <form [formGroup]="form" class="secciones" novalidate>
            <section class="tarjeta">
              <h2>Plan</h2>
              @if (soloLectura()) { <p class="texto">{{ x.plan || 'Sin registro.' }}</p> }
              @else { <mat-form-field class="ancho"><mat-label>Plan y conducta</mat-label><textarea matInput rows="4" formControlName="plan" maxlength="10000"></textarea></mat-form-field> }
            </section>
            <section class="tarjeta">
              <h2>Observaciones</h2>
              @if (soloLectura()) { <p class="texto">{{ x.observaciones || 'Sin registro.' }}</p> }
              @else { <mat-form-field class="ancho"><mat-label>Observaciones internas</mat-label><textarea matInput rows="3" formControlName="observaciones" maxlength="10000"></textarea><mat-hint>No las ve el paciente.</mat-hint></mat-form-field> }
            </section>
          </form>

          <section class="tarjeta">
            <h2>Exámenes solicitados</h2>
            <ul class="simple">@for (e of x.examenes; track e.id) { <li>{{ e.nombre }} <small class="muted">({{ e.tipo.toLowerCase() }})</small> <app-chip [estado]="e.estado" /></li> } @empty { <li class="muted">Ninguno solicitado.</li> }</ul>
            @if (!soloLectura()) {
              <form [formGroup]="ex" (ngSubmit)="agregarExamen()" class="campos fila-agregar" novalidate>
                <mat-form-field class="crece"><mat-label>Examen</mat-label><input matInput formControlName="nombre" maxlength="150" /></mat-form-field>
                <mat-form-field class="corto"><mat-label>Tipo</mat-label><mat-select formControlName="tipo"><mat-option value="LABORATORIO">Laboratorio</mat-option><mat-option value="IMAGEN">Imagen</mat-option><mat-option value="OTRO">Otro</mat-option></mat-select></mat-form-field>
                <button mat-stroked-button type="submit">Solicitar</button>
              </form>
            }
          </section>

          <section class="tarjeta">
            <h2>Indicaciones de esta atención</h2>
            <ul class="simple">@for (i of x.indicaciones; track i.id) { <li><a [routerLink]="['/medico/indicaciones', i.id]">{{ i.titulo }}</a> <app-chip [estado]="i.estado" /></li> } @empty { <li class="muted">Ninguna emitida desde esta atención.</li> }</ul>
            @if (x.medicoId === yo()) { <a mat-stroked-button [routerLink]="['/medico/pacientes', x.pacienteId, 'indicar']" [queryParams]="{ atencion: x.id }"><mat-icon>add</mat-icon> Nueva indicación</a> }
          </section>

          <section class="tarjeta">
            <h2>Documentos</h2>
            <ul class="simple">@for (d of x.documentos; track d.id) { <li><mat-icon>{{ d.tipo === 'application/pdf' ? 'picture_as_pdf' : 'image' }}</mat-icon> {{ d.nombre }} <button mat-button type="button" (click)="bajar(d)">Descargar</button></li> } @empty { <li class="muted">Sin documentos adjuntos.</li> }</ul>
            @if (!soloLectura()) {
              <input #archivo type="file" accept="application/pdf,image/jpeg,image/png" hidden (change)="subir($event)" />
              <button mat-stroked-button type="button" (click)="archivo.click()"><mat-icon>upload_file</mat-icon> Adjuntar documento</button>
            }
          </section>

          @if (x.enmiendasLista.length > 0 || puedeEnmendar()) {
            <section class="tarjeta">
              <h2>Enmiendas</h2>
              @for (e of x.enmiendasLista; track e.id) { <p class="enmienda"><strong>{{ hora(e.fecha) }} · {{ e.autor }}</strong><br />{{ e.texto }}<br /><em>Motivo: {{ e.motivo }}</em></p> }
              @if (puedeEnmendar()) {
                <form [formGroup]="enm" (ngSubmit)="enmendar()" class="campos" novalidate>
                  <mat-form-field class="ancho"><mat-label>Corrección</mat-label><textarea matInput rows="3" formControlName="texto" maxlength="10000"></textarea><mat-error>Escriba la corrección.</mat-error></mat-form-field>
                  <mat-form-field class="ancho"><mat-label>Motivo de la enmienda</mat-label><input matInput formControlName="motivo" maxlength="200" /><mat-error>Indique el motivo.</mat-error></mat-form-field>
                  <div class="ancho acciones-fila"><button mat-flat-button type="submit">Agregar enmienda</button></div>
                </form>
              }
            </section>
          }
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .secciones { display: grid; gap: 1rem; } section.tarjeta { display: grid; gap: .5rem; align-content: start; } section.tarjeta > h2, section.tarjeta > h3 { margin: 0; } section.tarjeta { margin-bottom: 1rem; } .secciones section.tarjeta { margin-bottom: 0; }
    .alergia { display: flex; gap: .5rem; align-items: center; margin: 0 0 1rem; }
    .guardado { display: flex; justify-content: flex-end; margin-bottom: .5rem; color: var(--mat-sys-on-surface-variant); } .guardado span { display: inline-flex; gap: .25rem; align-items: center; } .guardado .malo { color: var(--mat-sys-error); }
    .texto { white-space: pre-line; } .enmienda { border-left: 3px solid var(--mat-sys-outline-variant); padding-left: .75rem; }
    .simple { list-style: none; margin: 0 0 .75rem; padding: 0; display: grid; gap: .35rem; } .simple li { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .rejilla-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: .25rem 1rem; }
    .fila-agregar { display: flex; gap: .75rem; flex-wrap: wrap; align-items: flex-start; } .crece { flex: 1; min-width: 14rem; } .corto { width: 11rem; }
  `,
})
export class AtencionEditor {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Identificador de la atención (parámetro de la ruta). */
  readonly id = input.required({ transform: numberAttribute });
  protected readonly a = signal<any>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly alergias = signal('');
  protected readonly nombrePaciente = signal('');
  protected readonly guardado = signal<EstadoGuardado>('limpio');
  protected readonly ultimoGuardado = signal('');
  protected readonly cerrando = signal(false);
  protected readonly guardandoSignos = signal(false);
  protected readonly yo = computed(() => this.auth.usuario()?.id);
  protected readonly hora = (v: string | Date) => fechaHora(v);
  protected readonly soloLectura = computed(() => {
    const x = this.a();
    return !x || x.estado === 'CERRADA' || x.medicoId !== this.yo();
  });
  protected readonly puedeEnmendar = computed(() => {
    const x = this.a();
    return !!x && x.estado === 'CERRADA' && x.medicoId === this.yo();
  });
  protected readonly subtitulo = computed(() => {
    const x = this.a();
    return x ? `${this.nombrePaciente()} · ${fechaCorta(fechaLocal(x.fecha))} ${horaLocal(x.fecha)}` : '';
  });

  protected readonly form = this.fb.group({
    motivo: ['', [Validators.required, Validators.minLength(3)]],
    anamnesis: [''],
    examenFisico: [''],
    plan: [''],
    observaciones: [''],
  });
  protected readonly signos = this.fb.group({
    paSistolica: this.fb.control<number | null>(null),
    paDiastolica: this.fb.control<number | null>(null),
    frecuenciaCardiaca: this.fb.control<number | null>(null),
    frecuenciaRespiratoria: this.fb.control<number | null>(null),
    temperatura: this.fb.control<number | null>(null),
    saturacion: this.fb.control<number | null>(null),
    pesoKg: this.fb.control<number | null>(null),
    tallaCm: this.fb.control<number | null>(null),
  });
  protected readonly dx = this.fb.group({ descripcion: ['', [Validators.required, Validators.minLength(3)]], codigoCie10: ['', Validators.pattern(/^([A-Za-z]\d{2}(\.\d{1,2})?)?$/)] });
  protected readonly ex = this.fb.group({ nombre: ['', [Validators.required, Validators.minLength(2)]], tipo: ['LABORATORIO'] });
  protected readonly enm = this.fb.group({ texto: ['', [Validators.required, Validators.minLength(3)]], motivo: ['', [Validators.required, Validators.minLength(3)]] });
  /** IMC calculado al vuelo con el peso y la talla del formulario. */
  protected readonly imc = signal<number | null>(null);

  private formularioCargado = false;
  private cola: Promise<unknown> = Promise.resolve();

  constructor() {
    this.form.valueChanges.pipe(debounceTime(1500), takeUntilDestroyed()).subscribe(() => void this.guardarAhora());
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.formularioCargado && !this.soloLectura()) this.guardado.set(this.form.dirty ? 'pendiente' : this.guardado());
    });
    this.signos.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      const peso = Number(v.pesoKg);
      const talla = Number(v.tallaCm);
      this.imc.set(peso > 0 && talla > 0 ? Math.round((peso / (talla / 100) ** 2) * 10) / 10 : null);
    });
    // Al salir de la pantalla no se pierde lo último que se escribió.
    inject(DestroyRef).onDestroy(() => {
      if (this.formularioCargado && !this.soloLectura() && this.form.dirty) void this.guardarAhora();
    });
    effect(() => {
      this.id();
      untracked(() => {
        this.formularioCargado = false;
        this.a.set(null);
        this.cargar();
      });
    });
  }

  protected cargar(): void {
    this.cargando.set(this.a() === null);
    this.api.get<any>(`/atenciones/${this.id()}`).subscribe({
      next: (x) => {
        const primera = !this.formularioCargado;
        this.a.set(x);
        if (primera) {
          this.form.reset({ motivo: x.motivo, anamnesis: x.anamnesis ?? '', examenFisico: x.examenFisico ?? '', plan: x.plan ?? '', observaciones: x.observaciones ?? '' }, { emitEvent: false });
          const sv = x.signosVitales;
          if (sv) {
            this.signos.reset(
              {
                paSistolica: sv.paSistolica,
                paDiastolica: sv.paDiastolica,
                frecuenciaCardiaca: sv.frecuenciaCardiaca,
                frecuenciaRespiratoria: sv.frecuenciaRespiratoria,
                temperatura: sv.temperatura === null ? null : Number(sv.temperatura),
                saturacion: sv.saturacion,
                pesoKg: sv.pesoKg === null ? null : Number(sv.pesoKg),
                tallaCm: sv.tallaCm === null ? null : Number(sv.tallaCm),
              },
              { emitEvent: false },
            );
            this.imc.set(sv.imc ?? null);
          }
          this.formularioCargado = true;
          this.api.get<any>(`/ficha/${x.pacienteId}`).subscribe({
            next: (r) => {
              this.nombrePaciente.set(`${r.identificacion.nombre} · RUT ${r.identificacion.rut}`);
              this.alergias.set(textoAlergias(r));
            },
            error: () => undefined,
          });
        }
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  // ── Autoguardado ──

  /** Guarda el borrador ahora. Los guardados se encolan para que nunca se pisen entre sí. */
  protected guardarAhora(): Promise<boolean> {
    const p = this.cola.then(() => this.guardarUnaVez());
    this.cola = p.catch(() => false);
    return p;
  }

  private async guardarUnaVez(): Promise<boolean> {
    if (this.soloLectura() || !this.form.dirty) return true;
    if (this.form.controls.motivo.invalid) {
      this.guardado.set('motivo');
      return false;
    }
    const instantanea = JSON.stringify(this.form.getRawValue());
    this.guardado.set('guardando');
    try {
      await firstValueFrom(this.api.patch(`/atenciones/${this.id()}`, this.form.getRawValue()));
      // Si se siguió escribiendo durante el guardado, el formulario sigue «sucio» y se guardará de nuevo.
      if (JSON.stringify(this.form.getRawValue()) === instantanea) this.form.markAsPristine();
      this.ultimoGuardado.set(horaLocal(new Date()));
      this.guardado.set(this.form.dirty ? 'pendiente' : 'guardado');
      return true;
    } catch (e) {
      this.guardado.set('error');
      this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
      return false;
    }
  }

  protected guardarSignos(): void {
    const v = this.signos.getRawValue();
    const cuerpo: Record<string, number> = {};
    for (const [k, x] of Object.entries(v)) if (x !== null && x !== undefined && (x as unknown) !== '') cuerpo[k] = Number(x);
    this.guardandoSignos.set(true);
    this.api.put(`/atenciones/${this.id()}/signos`, cuerpo).subscribe({
      next: () => {
        this.guardandoSignos.set(false);
        this.snack.open('Signos vitales guardados', 'Cerrar', { duration: 3000 });
      },
      error: (e: unknown) => {
        this.guardandoSignos.set(false);
        this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
      },
    });
  }

  // ── Cierre y enmiendas ──

  protected async cerrar(): Promise<void> {
    if (!(await this.guardarAhora())) return;
    const r = await confirmar(this.dialog, {
      titulo: 'Cerrar la atención',
      texto: 'Una vez cerrada no se puede editar: solo podrá agregar enmiendas con motivo. ¿Desea cerrarla?',
      confirmar: 'Cerrar atención',
    });
    if (!r) return;
    this.cerrando.set(true);
    this.api.post(`/atenciones/${this.id()}/cerrar`).subscribe({
      next: () => {
        this.cerrando.set(false);
        this.snack.open('Atención cerrada', 'Cerrar', { duration: 4000 });
        this.guardado.set('limpio');
        this.cargar();
      },
      error: (e: unknown) => {
        this.cerrando.set(false);
        this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
      },
    });
  }

  protected enmendar(): void {
    if (this.enm.invalid) return this.enm.markAllAsTouched();
    this.api.post(`/atenciones/${this.id()}/enmiendas`, this.enm.getRawValue()).subscribe({
      next: () => {
        this.enm.reset();
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }

  // ── Elementos ligados a la atención ──

  protected agregarDx(): void {
    if (this.dx.invalid) return this.dx.markAllAsTouched();
    const v = this.dx.getRawValue();
    this.api.post(`/ficha/${this.a().pacienteId}/diagnosticos`, { descripcion: v.descripcion, codigoCie10: v.codigoCie10 || undefined, atencionId: this.id() }).subscribe({
      next: () => {
        this.dx.reset();
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }

  protected agregarExamen(): void {
    if (this.ex.invalid) return this.ex.markAllAsTouched();
    this.api.post(`/ficha/${this.a().pacienteId}/examenes`, { ...this.ex.getRawValue(), atencionId: this.id() }).subscribe({
      next: () => {
        this.ex.reset({ nombre: '', tipo: 'LABORATORIO' });
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }

  protected subir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    if (archivo.size > 10 * 1024 * 1024) {
      this.snack.open('El archivo supera los 10 MB', 'Cerrar');
      input.value = '';
      return;
    }
    this.api.subir(`/ficha/${this.a().pacienteId}/documentos`, archivo, { atencionId: this.id() }).subscribe({
      next: () => {
        input.value = '';
        this.cargar();
      },
      error: (e: unknown) => {
        input.value = '';
        this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
      },
    });
  }

  protected bajar(d: { id: number; nombre: string }): void {
    this.api.descargar(`/documentos/${d.id}/archivo`).subscribe({ next: (b) => guardarArchivo(b, d.nombre), error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar') });
  }
}
