import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../core/api';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { fechaCorta, fechaLocal, horaLocal, hoyIso } from '../core/fechas';
import { Estado, Pagina, confirmar } from '../shared/piezas';

interface Tramo {
  inicio: string;
  fin: string;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MOTIVOS: Record<string, string> = { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', OTRO: 'Otro' };
const hhmm = (v: string) => v.slice(0, 5);

/**
 * Horario semanal y bloqueos de un médico. Lo usa el propio médico para su agenda y la administración para la de cualquier
 * profesional. Los cambios de horario nunca mueven ni cancelan citas ya reservadas: si dejan citas fuera de horario, se avisa y
 * recepción las reprograma.
 */
@Component({
  selector: 'app-disponibilidad',
  imports: [Pagina, Estado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Disponibilidad" subtitulo="Su horario de atención y los días en que no atiende" [volver]="!!id()">
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        <section class="tarjeta">
          <h2>Horario semanal</h2>
          <p class="muted">Las citas duran lo que indica el perfil del profesional; las horas se ofrecen dentro de cada tramo.</p>
          <div class="semana">
            @for (d of dias; track $index; let n = $index) {
              <div class="dia">
                <h3>{{ d }}</h3>
                @for (t of tramos()[n + 1]; track $index; let i = $index) {
                  <span class="tramo">
                    <input class="hora-input" type="time" [value]="t.inicio" (input)="cambiar(n + 1, i, 'inicio', $any($event.target).value)" [attr.aria-label]="d + ': desde'" />
                    <span aria-hidden="true">–</span>
                    <input class="hora-input" type="time" [value]="t.fin" (input)="cambiar(n + 1, i, 'fin', $any($event.target).value)" [attr.aria-label]="d + ': hasta'" />
                    <button mat-icon-button type="button" (click)="quitar(n + 1, i)" [attr.aria-label]="'Quitar tramo del ' + d.toLowerCase()"><mat-icon>close</mat-icon></button>
                  </span>
                } @empty { <span class="muted">No atiende</span> }
                <button mat-button type="button" (click)="agregar(n + 1)"><mat-icon>add</mat-icon> Agregar tramo</button>
              </div>
            }
          </div>
          @if (errorHorario()) { <p class="aviso aviso-error" role="alert"><mat-icon>error</mat-icon>{{ errorHorario() }}</p> }
          <div class="guardar">
            <mat-form-field class="fecha"><mat-label>Rige desde</mat-label><input matInput type="date" [min]="hoy" [value]="desde()" (input)="desde.set($any($event.target).value)" /></mat-form-field>
            <button mat-flat-button type="button" (click)="guardarHorario()" [disabled]="guardando()">Guardar horario</button>
          </div>
        </section>

        <section class="tarjeta">
          <h2>Bloqueos de agenda</h2>
          <p class="muted">Días u horas en que no atiende (vacaciones, permisos, congresos). Un bloqueo nunca cancela citas: si hay citas dentro, se le avisa y recepción las reprograma.</p>
          <ul class="lista-tarjetas">
            @for (b of bloqueos(); track b.id) {
              <li class="item"><mat-icon>event_busy</mat-icon><span class="grande"><strong>{{ rango(b) }}</strong><small>{{ motivos[b.motivo] }}{{ b.detalle ? ' · ' + b.detalle : '' }}</small></span>
                <button mat-button type="button" class="peligro" (click)="quitarBloqueo(b)">Quitar</button></li>
            } @empty { <li class="muted">No hay bloqueos.</li> }
          </ul>

          <form class="campos nuevo" [formGroup]="bloqueo" (ngSubmit)="crearBloqueo()" novalidate>
            <h3 class="ancho">Nuevo bloqueo</h3>
            <mat-form-field><mat-label>Desde (fecha)</mat-label><input matInput type="date" formControlName="fechaDesde" /><mat-error>Indique la fecha.</mat-error></mat-form-field>
            <mat-form-field><mat-label>Hasta (fecha)</mat-label><input matInput type="date" formControlName="fechaHasta" /><mat-error>Indique la fecha.</mat-error></mat-form-field>
            <mat-slide-toggle class="ancho" [checked]="todoElDia()" (change)="todoElDia.set($event.checked)">Todo el día</mat-slide-toggle>
            @if (!todoElDia()) {
              <mat-form-field><mat-label>Desde (hora)</mat-label><input matInput type="time" formControlName="horaDesde" /></mat-form-field>
              <mat-form-field><mat-label>Hasta (hora)</mat-label><input matInput type="time" formControlName="horaHasta" /></mat-form-field>
            }
            <mat-form-field><mat-label>Motivo</mat-label><mat-select formControlName="motivo"><mat-option value="VACACIONES">Vacaciones</mat-option><mat-option value="PERMISO">Permiso</mat-option><mat-option value="OTRO">Otro</mat-option></mat-select></mat-form-field>
            <mat-form-field><mat-label>Detalle (opcional)</mat-label><input matInput formControlName="detalle" maxlength="200" /></mat-form-field>
            <div class="ancho acciones-fila"><button mat-flat-button type="submit">Bloquear</button></div>
          </form>
        </section>
      </app-estado>
    </app-pagina>
  `,
  styles: `
    section.tarjeta { margin-bottom: 1rem; }
    .semana { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: 1rem; margin: 1rem 0; }
    .dia { border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; padding: .75rem; display: grid; gap: .4rem; align-content: start; } .dia h3 { margin: 0; }
    .tramo { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: center; gap: .3rem; }
    .hora-input { font: inherit; padding: .5rem .6rem; border: 1px solid var(--mat-sys-outline); border-radius: 8px; background: var(--mat-sys-surface); color: inherit; min-height: 44px; width: 100%; min-width: 0; box-sizing: border-box; }
    .guardar { display: flex; gap: 1rem; align-items: baseline; flex-wrap: wrap; } .fecha { width: 12rem; }
    .nuevo { margin-top: 1rem; }
  `,
})
export class Disponibilidad {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Médico cuya agenda se edita. Sin valor, la del usuario con sesión. */
  readonly id = input<string>();
  protected readonly medicoId = computed(() => (this.id() ? Number(this.id()) : (this.auth.usuario()?.id ?? 0)));
  protected readonly dias = DIAS;
  protected readonly motivos = MOTIVOS;
  protected readonly hoy = hoyIso();
  protected readonly tramos = signal<Record<number, Tramo[]>>({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] });
  protected readonly desde = signal(hoyIso());
  protected readonly bloqueos = signal<any[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly errorHorario = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly todoElDia = signal(true);
  protected readonly bloqueo = this.fb.group({
    fechaDesde: [hoyIso(), Validators.required],
    horaDesde: ['08:00'],
    fechaHasta: [hoyIso(), Validators.required],
    horaHasta: ['18:00'],
    motivo: ['VACACIONES'],
    detalle: [''],
  });

  constructor() {
    effect(() => {
      this.medicoId();
      untracked(() => this.cargar());
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    const id = this.medicoId();
    this.api.get<any[]>(`/agenda/${id}/bloques`).subscribe({
      next: (bloques) => {
        const t: Record<number, Tramo[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
        for (const b of bloques) t[b.diaSemana].push({ inicio: hhmm(b.horaInicio), fin: hhmm(b.horaFin) });
        this.tramos.set(t);
        this.api.get<any[]>(`/agenda/${id}/bloqueos`).subscribe({
          next: (r) => {
            this.bloqueos.set(r);
            this.error.set(null);
            this.cargando.set(false);
          },
          error: (e: unknown) => this.fallar(e),
        });
      },
      error: (e: unknown) => this.fallar(e),
    });
  }

  private fallar(e: unknown): void {
    this.error.set(mensajeError(e));
    this.cargando.set(false);
  }

  // ── Horario semanal ──

  protected agregar(dia: number): void {
    this.tramos.update((t) => ({ ...t, [dia]: [...t[dia], { inicio: '', fin: '' }] }));
  }
  protected quitar(dia: number, i: number): void {
    this.tramos.update((t) => ({ ...t, [dia]: t[dia].filter((_, j) => j !== i) }));
  }
  protected cambiar(dia: number, i: number, campo: 'inicio' | 'fin', valor: string): void {
    this.tramos.update((t) => ({ ...t, [dia]: t[dia].map((x, j) => (j === i ? { ...x, [campo]: valor } : x)) }));
  }

  /** Revisa los tramos antes de enviarlos: completos, con el inicio antes del fin y sin solaparse. */
  private validar(): string | null {
    for (let d = 1; d <= 7; d++) {
      const lista = this.tramos()[d];
      for (const t of lista) {
        if (!t.inicio || !t.fin) return `${DIAS[d - 1]}: complete las horas de cada tramo o quítelo.`;
        if (t.inicio >= t.fin) return `${DIAS[d - 1]}: la hora de término debe ser posterior a la de inicio.`;
      }
      const orden = [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio));
      for (let i = 1; i < orden.length; i++) if (orden[i].inicio < orden[i - 1].fin) return `${DIAS[d - 1]}: hay tramos que se superponen.`;
    }
    return null;
  }

  protected guardarHorario(confirmado = false): void {
    const error = this.validar();
    this.errorHorario.set(error);
    if (error) return;
    if (!this.desde() || this.desde() < this.hoy) {
      this.errorHorario.set('La fecha de inicio no puede ser anterior a hoy.');
      return;
    }
    const bloques = Object.entries(this.tramos()).flatMap(([dia, lista]) => lista.map((t) => ({ diaSemana: Number(dia), horaInicio: t.inicio, horaFin: t.fin })));
    this.guardando.set(true);
    this.api.put(`/agenda/${this.medicoId()}/bloques`, { desde: this.desde(), bloques, confirmar: confirmado || undefined }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.snack.open('Horario guardado', 'Cerrar', { duration: 4000 });
        this.cargar();
      },
      error: async (e: { status?: number; error?: { citasAfectadas?: unknown[] } }) => {
        this.guardando.set(false);
        const n = e.error?.citasAfectadas?.length ?? 0;
        if (e.status === 409 && n > 0) {
          const r = await confirmar(this.dialog, {
            titulo: 'El cambio deja citas fuera del horario',
            texto: `${n} cita(s) ya reservadas quedarían fuera del nuevo horario. No se cancelan ni se mueven: recepción las reprograma. ¿Desea guardar igual?`,
            confirmar: 'Guardar igual',
          });
          if (r) this.guardarHorario(true);
        } else this.errorHorario.set(mensajeError(e));
      },
    });
  }

  // ── Bloqueos ──

  protected rango(b: { desde: string; hasta: string }): string {
    const d = fechaLocal(b.desde);
    const h = fechaLocal(b.hasta);
    const hd = horaLocal(b.desde);
    const hh = horaLocal(b.hasta);
    if (hd === '00:00' && (hh === '23:59' || hh === '00:00')) return d === h ? `${fechaCorta(d)} (todo el día)` : `${fechaCorta(d)} al ${fechaCorta(h)}`;
    return d === h ? `${fechaCorta(d)}, ${hd} a ${hh}` : `${fechaCorta(d)} ${hd} al ${fechaCorta(h)} ${hh}`;
  }

  protected crearBloqueo(confirmado = false): void {
    if (this.bloqueo.invalid) return this.bloqueo.markAllAsTouched();
    const v = this.bloqueo.getRawValue();
    const cuerpo = {
      fechaDesde: v.fechaDesde,
      horaDesde: this.todoElDia() ? '00:00' : v.horaDesde,
      fechaHasta: v.fechaHasta,
      horaHasta: this.todoElDia() ? '23:59' : v.horaHasta,
      motivo: v.motivo,
      detalle: v.detalle || undefined,
      confirmar: confirmado || undefined,
    };
    this.api.post(`/agenda/${this.medicoId()}/bloqueos`, cuerpo).subscribe({
      next: (r: any) => {
        this.bloqueo.patchValue({ detalle: '' });
        const n = r.citasAfectadas?.length ?? 0;
        this.snack.open(n > 0 ? `Bloqueo creado. ${n} cita(s) quedaron por reprogramar; se avisó a recepción.` : 'Bloqueo creado', 'Cerrar', { duration: 6000 });
        this.cargar();
      },
      error: async (e: { status?: number; error?: { citasAfectadas?: unknown[] } }) => {
        const n = e.error?.citasAfectadas?.length ?? 0;
        if (e.status === 409 && n > 0) {
          const r = await confirmar(this.dialog, {
            titulo: 'Hay citas dentro del bloqueo',
            texto: `${n} cita(s) ya reservadas caen en ese rango. No se cancelan: se avisa a recepción para reprogramarlas. ¿Desea bloquear igual?`,
            confirmar: 'Bloquear igual',
          });
          if (r) this.crearBloqueo(true);
        } else this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
      },
    });
  }

  protected async quitarBloqueo(b: { id: number }): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Quitar el bloqueo', texto: 'Las horas volverán a quedar disponibles para reservar.', confirmar: 'Quitar' });
    if (!r) return;
    this.api.delete(`/agenda/${this.medicoId()}/bloqueos/${b.id}`).subscribe({ next: () => this.cargar(), error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }) });
  }
}
