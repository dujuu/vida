import { Component, effect, inject, input, numberAttribute, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaHora, fechaLarga } from '../core/fechas';
import type { Cita, Profesional } from '../core/models';
import { BuscadorPaciente, type PacienteBuscado } from '../shared/buscador-paciente';
import { Estado, Pagina } from '../shared/piezas';
import { SelectorHora, type HoraElegida } from '../shared/selector-hora';

/**
 * Reserva de una hora por recepción: paciente, especialidad, médico y hora, más el canal por el que se pidió (mesón o teléfono).
 * Si la hora se ocupó mientras tanto, muestra las horas actualizadas en vez de fallar en silencio.
 */
@Component({
  selector: 'app-reservar-recepcion',
  imports: [Pagina, Estado, BuscadorPaciente, SelectorHora, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <app-pagina titulo="Nueva cita" [subtitulo]="paciente() ? paciente()!.nombre + ' · RUT ' + paciente()!.rut : ''" [volver]="true">
      <ol class="pasos" aria-label="Pasos">
        @for (p of pasos; track p; let i = $index) { <li [class.activo]="paso() === i + 1" [class.hecho]="paso() > i + 1" [attr.aria-current]="paso() === i + 1 ? 'step' : null"><span>{{ i + 1 }}</span> {{ p }}</li> }
      </ol>

      @switch (paso()) {
        @case (1) {
          <h2>¿Para quién es la cita?</h2>
          <app-buscador-paciente etiqueta="Buscar paciente por nombre o RUT" (elegido)="elegirPaciente($event)">
            <p sinResultados class="muted">¿Es un paciente nuevo? <a mat-button routerLink="../pacientes/nuevo">Registrarlo</a></p>
          </app-buscador-paciente>
        }
        @case (2) {
          <h2>¿Qué especialidad?</h2>
          <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargarEspecialidades()">
            <div class="opciones">@for (e of especialidades(); track e.id) { <button class="opcion" type="button" (click)="elegirEspecialidad(e.id)"><mat-icon>medical_services</mat-icon>{{ e.nombre }}</button> }</div>
          </app-estado>
          <button mat-button type="button" (click)="paso.set(1)">Cambiar paciente</button>
        }
        @case (3) {
          <h2>¿Con qué médico?</h2>
          <app-estado [cargando]="cargando()" [error]="error()" [vacio]="medicos().length === 0" mensaje="No hay médicos activos en esta especialidad.">
            <ul class="lista-tarjetas">@for (m of medicos(); track m.id) { <li><button class="item opcion-fila" type="button" (click)="elegirMedico(m)"><mat-icon>person</mat-icon><span class="grande"><strong>{{ m.nombre }}</strong><small>{{ m.presentacion || m.especialidad }} · citas de {{ m.duracionCitaMin }} min</small></span><mat-icon>chevron_right</mat-icon></button></li> }</ul>
          </app-estado>
          <button mat-button type="button" (click)="paso.set(2)">Cambiar especialidad</button>
        }
        @case (4) {
          <h2>{{ medico()?.nombre }}</h2>
          <app-selector-hora [medicoId]="medico()?.id ?? null" [elegida]="hora()" [recargar]="recarga()" (horaElegida)="hora.set($event)" />
          @if (hora(); as h) {
            <form class="tarjeta campos confirmar" [formGroup]="datos" (ngSubmit)="reservar()">
              <p class="ancho">Cita de <strong>{{ paciente()?.nombre }}</strong> con <strong>{{ medico()?.nombre }}</strong> el <strong>{{ fechaLarga(h.fecha) }}</strong> a las <strong>{{ h.hora }}</strong>.</p>
              <mat-form-field><mat-label>Canal</mat-label><mat-select formControlName="canal"><mat-option value="MESON">En el mesón</mat-option><mat-option value="TELEFONO">Por teléfono</mat-option></mat-select></mat-form-field>
              <mat-form-field><mat-label>Tipo de cita</mat-label><mat-select formControlName="tipo"><mat-option value="">Automático</mat-option><mat-option value="PRIMERA_VEZ">Primera vez</mat-option><mat-option value="CONTROL">Control</mat-option><mat-option value="EXAMEN">Examen</mat-option><mat-option value="OTRO">Otro</mat-option></mat-select></mat-form-field>
              <mat-form-field class="ancho"><mat-label>Nota (opcional)</mat-label><input matInput formControlName="nota" maxlength="200" /><mat-hint>Solo datos administrativos: no escriba información de salud.</mat-hint></mat-form-field>
              @if (conflicto()) { <p class="aviso aviso-error ancho" role="alert">{{ conflicto() }}</p> }
              <div class="ancho acciones-fila"><button mat-flat-button type="submit" [disabled]="enviando()">{{ enviando() ? 'Reservando…' : 'Confirmar la cita' }}</button></div>
            </form>
          }
          <button mat-button type="button" (click)="paso.set(3)">Cambiar médico</button>
        }
      }
    </app-pagina>
  `,
  styles: `
    .pasos { display: flex; gap: .5rem; list-style: none; padding: 0; margin: 0 0 1rem; flex-wrap: wrap; }
    .pasos li { display: flex; align-items: center; gap: .4rem; color: var(--mat-sys-on-surface-variant); padding: .25rem .75rem .25rem .25rem; border-radius: 999px; }
    .pasos li span { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--mat-sys-surface-container-high); font-weight: 700; }
    .pasos li.activo { color: var(--mat-sys-on-surface); font-weight: 600; } .pasos li.activo span, .pasos li.hecho span { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); }
    .opciones { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
    .opcion, .opcion-fila { display: flex; align-items: center; gap: .75rem; width: 100%; padding: 1rem; min-height: 56px; border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; background: var(--mat-sys-surface-container-lowest); color: inherit; font: inherit; cursor: pointer; text-align: left; }
    .opcion:hover, .opcion-fila:hover { border-color: var(--mat-sys-primary); background: var(--vn-suave); }
    .confirmar { margin: 1rem 0; }
  `,
})
export class ReservarRecepcion {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Paciente ya elegido (viene de su ficha). */
  readonly pacienteId = input<string>(undefined, { alias: 'paciente' });
  protected readonly pasos = ['Paciente', 'Especialidad', 'Médico', 'Día y hora'];
  protected readonly paso = signal(1);
  protected readonly paciente = signal<{ id: number; nombre: string; rut: string } | null>(null);
  protected readonly especialidades = signal<Array<{ id: number; nombre: string }>>([]);
  protected readonly medicos = signal<Profesional[]>([]);
  protected readonly medico = signal<Profesional | null>(null);
  protected readonly hora = signal<HoraElegida | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly conflicto = signal<string | null>(null);
  protected readonly recarga = signal(0);
  protected readonly fechaLarga = fechaLarga;
  protected readonly datos = this.fb.group({ canal: ['MESON'], tipo: [''], nota: [''] });

  constructor() {
    effect(() => {
      const id = this.pacienteId();
      if (!id) return;
      untracked(() => {
        this.api.get<any>(`/pacientes/${id}`).subscribe({
          next: (p) => {
            this.paciente.set({ id: p.id, nombre: p.nombre, rut: p.rut });
            this.irAEspecialidad();
          },
          error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
        });
      });
    });
  }

  protected elegirPaciente(p: PacienteBuscado): void {
    this.paciente.set({ id: p.id, nombre: p.nombre, rut: p.rut });
    this.irAEspecialidad();
  }

  private irAEspecialidad(): void {
    this.paso.set(2);
    if (this.especialidades().length === 0) this.cargarEspecialidades();
  }

  protected cargarEspecialidades(): void {
    this.cargando.set(true);
    this.api.get<Array<{ id: number; nombre: string }>>('/especialidades').subscribe({
      next: (r) => {
        this.especialidades.set(r);
        this.error.set(null);
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
    this.paso.set(3);
    this.api.get<Profesional[]>('/profesionales', { especialidad: id }).subscribe({
      next: (r) => {
        this.medicos.set(r);
        this.error.set(null);
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
    this.paso.set(4);
  }

  protected reservar(): void {
    const h = this.hora();
    const m = this.medico();
    const p = this.paciente();
    if (!h || !m || !p || this.enviando()) return;
    const v = this.datos.getRawValue();
    this.enviando.set(true);
    this.conflicto.set(null);
    this.api.post('/citas', { medicoId: m.id, pacienteId: p.id, inicio: h.inicio, canal: v.canal, tipo: v.tipo || undefined, nota: v.nota || undefined }).subscribe({
      next: () => {
        this.snack.open('Cita reservada. El paciente recibió un aviso.', 'Cerrar', { duration: 5000 });
        void this.router.navigateByUrl('/recepcion/agenda', { replaceUrl: true });
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

/** Cambio de hora de una cita ya reservada. La hora anterior queda libre y el paciente recibe un aviso. */
@Component({
  selector: 'app-reprogramar-recepcion',
  imports: [Pagina, Estado, SelectorHora, MatButtonModule],
  template: `
    <app-pagina titulo="Reprogramar la cita" [subtitulo]="cita() ? cita()!.paciente.nombre + ' · ' + cita()!.medico.nombre : ''" [volver]="true">
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (cita(); as c) {
          <p class="muted">Hora actual: <strong>{{ hora(c.inicio) }}</strong></p>
          <app-selector-hora [medicoId]="c.medico.id" [elegida]="nueva()" [recargar]="recarga()" (horaElegida)="nueva.set($event)" />
          @if (nueva(); as h) {
            <section class="tarjeta confirmar">
              <p>Cambiar a <strong>{{ fechaLarga(h.fecha) }}</strong> a las <strong>{{ h.hora }}</strong>.</p>
              @if (conflicto()) { <p class="aviso aviso-error" role="alert">{{ conflicto() }}</p> }
              <button mat-flat-button type="button" (click)="confirmar()" [disabled]="enviando()">{{ enviando() ? 'Guardando…' : 'Confirmar el cambio' }}</button>
            </section>
          }
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `.confirmar { margin: 1rem 0; display: grid; gap: .75rem; }`,
})
export class ReprogramarRecepcion {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  readonly id = input.required({ transform: numberAttribute });
  protected readonly cita = signal<Cita | null>(null);
  protected readonly nueva = signal<HoraElegida | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly conflicto = signal<string | null>(null);
  protected readonly recarga = signal(0);
  protected readonly fechaLarga = fechaLarga;
  protected readonly hora = (v: string | Date) => fechaHora(v);

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.cargar());
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<Cita>(`/citas/${this.id()}`).subscribe({
      next: (c) => {
        this.cita.set(c);
        this.error.set(c.estado === 'RESERVADA' ? null : 'Solo se puede reprogramar una cita reservada.');
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected confirmar(): void {
    const h = this.nueva();
    if (!h || this.enviando()) return;
    this.enviando.set(true);
    this.conflicto.set(null);
    this.api.post(`/citas/${this.id()}/reprogramar`, { inicio: h.inicio }).subscribe({
      next: () => {
        this.snack.open('Cita reprogramada. El paciente recibió un aviso.', 'Cerrar', { duration: 5000 });
        void this.router.navigateByUrl('/recepcion/agenda', { replaceUrl: true });
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.conflicto.set(mensajeError(e));
        this.nueva.set(null);
        this.recarga.update((n) => n + 1);
      },
    });
  }
}
