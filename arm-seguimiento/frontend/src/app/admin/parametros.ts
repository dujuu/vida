import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { Estado, Pagina } from '../shared/piezas';

interface Parametro {
  clave: string;
  valor: string;
  descripcion: string;
}

/** Rango y unidad de cada parámetro. El servidor valida lo mismo: aquí se muestra para evitar errores al escribir. */
const META: Record<string, { tipo: 'entero' | 'booleano' | 'texto'; min?: number; max?: number; unidad?: string; grupo: string }> = {
  centro_nombre: { tipo: 'texto', grupo: 'Centro' },
  consentimiento_version: { tipo: 'entero', min: 1, max: 1000, grupo: 'Centro' },
  clave_unica_simulada: { tipo: 'booleano', grupo: 'Acceso' },
  sesion_paciente_dias: { tipo: 'entero', min: 1, max: 90, unidad: 'días', grupo: 'Acceso' },
  sesion_personal_horas: { tipo: 'entero', min: 1, max: 72, unidad: 'horas', grupo: 'Acceso' },
  login_intentos_max: { tipo: 'entero', min: 3, max: 20, unidad: 'intentos', grupo: 'Acceso' },
  login_bloqueo_min: { tipo: 'entero', min: 1, max: 240, unidad: 'minutos', grupo: 'Acceso' },
  codigo_vigencia_horas: { tipo: 'entero', min: 1, max: 168, unidad: 'horas', grupo: 'Acceso' },
  cita_duracion_min: { tipo: 'entero', min: 10, max: 120, unidad: 'minutos', grupo: 'Citas' },
  cancelacion_horas: { tipo: 'entero', min: 0, max: 168, unidad: 'horas', grupo: 'Citas' },
  reserva_antelacion_min_horas: { tipo: 'entero', min: 0, max: 72, unidad: 'horas', grupo: 'Citas' },
  reserva_antelacion_max_dias: { tipo: 'entero', min: 1, max: 365, unidad: 'días', grupo: 'Citas' },
  citas_futuras_max: { tipo: 'entero', min: 1, max: 20, unidad: 'citas', grupo: 'Citas' },
  toma_plazo_dias: { tipo: 'entero', min: 0, max: 7, unidad: 'días', grupo: 'Tratamientos' },
  aviso_toma_minutos: { tipo: 'entero', min: 0, max: 240, unidad: 'minutos', grupo: 'Tratamientos' },
  avisos_tope_diario: { tipo: 'entero', min: 1, max: 50, unidad: 'avisos', grupo: 'Tratamientos' },
  continuidad_riesgo_dias: { tipo: 'entero', min: 1, max: 60, unidad: 'días', grupo: 'Seguimiento' },
  continuidad_desercion_dias: { tipo: 'entero', min: 7, max: 365, unidad: 'días', grupo: 'Seguimiento' },
  contactos_tope_salientes: { tipo: 'entero', min: 1, max: 20, unidad: 'contactos', grupo: 'Seguimiento' },
};
const GRUPOS = ['Centro', 'Acceso', 'Citas', 'Tratamientos', 'Seguimiento'];

/**
 * Parámetros del sistema. Cada cambio se valida contra su rango y queda en la auditoría con el valor anterior y el nuevo. Los
 * cambios rigen en unos segundos, sin reiniciar el servidor.
 */
@Component({
  selector: 'app-parametros-admin',
  imports: [Pagina, Estado, FormsModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Parámetros" subtitulo="Reglas de funcionamiento del centro">
      <button acciones mat-flat-button type="button" (click)="guardar()" [disabled]="cambios() === 0 || guardando()"><mat-icon>save</mat-icon> Guardar {{ cambios() > 0 ? '(' + cambios() + ')' : '' }}</button>
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @for (g of grupos; track g) {
          <section class="tarjeta">
            <h2>{{ g }}</h2>
            <div class="campos">
              @for (p of delGrupo(g); track p.clave) {
                @if (meta(p.clave).tipo === 'booleano') {
                  <div class="ancho interruptor"><mat-slide-toggle [checked]="valor(p) === '1'" (change)="poner(p, $event.checked ? '1' : '0')">{{ p.descripcion }}</mat-slide-toggle></div>
                } @else {
                  <mat-form-field class="ancho">
                    <mat-label>{{ p.descripcion }}</mat-label>
                    <input matInput [type]="meta(p.clave).tipo === 'entero' ? 'number' : 'text'" [attr.min]="meta(p.clave).min" [attr.max]="meta(p.clave).max" [ngModel]="valor(p)" (ngModelChange)="poner(p, $event)" [name]="p.clave" />
                    @if (meta(p.clave).unidad) { <span matTextSuffix>{{ meta(p.clave).unidad }}</span> }
                    @if (meta(p.clave).tipo === 'entero') { <mat-hint>Entre {{ meta(p.clave).min }} y {{ meta(p.clave).max }}</mat-hint> }
                    @if (errorDe(p)) { <mat-error>{{ errorDe(p) }}</mat-error> }
                  </mat-form-field>
                }
              }
            </div>
          </section>
        }
        @if (errorGuardar()) { <p class="aviso aviso-error" role="alert">{{ errorGuardar() }}</p> }
        @if (hayOtros()) { <p class="muted">Hay {{ otros().length }} parámetro(s) técnicos que no se editan desde aquí.</p> }
      </app-estado>
    </app-pagina>
  `,
  styles: `section.tarjeta { margin-bottom: 1rem; } .interruptor { padding: .25rem 0 .75rem; }`,
})
export class ParametrosAdmin {
  private readonly api = inject(Api);
  private readonly snack = inject(MatSnackBar);
  protected readonly grupos = GRUPOS;
  protected readonly parametros = signal<Parametro[]>([]);
  protected readonly editados = signal<Record<string, string>>({});
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorGuardar = signal<string | null>(null);

  constructor() {
    this.cargar();
  }

  protected meta = (clave: string) => META[clave] ?? { tipo: 'texto' as const, grupo: 'Otros' };
  protected delGrupo = (g: string) => this.parametros().filter((p) => META[p.clave]?.grupo === g);
  protected otros = () => this.parametros().filter((p) => !META[p.clave]);
  protected hayOtros = () => this.otros().length > 0;
  protected valor = (p: Parametro) => this.editados()[p.clave] ?? p.valor;
  protected cambios = () => Object.keys(this.editados()).length;

  protected poner(p: Parametro, v: string | number): void {
    const texto = String(v ?? '').trim();
    this.editados.update((e) => {
      const copia = { ...e };
      if (texto === p.valor) delete copia[p.clave];
      else copia[p.clave] = texto;
      return copia;
    });
  }

  /** Mensaje de rango si el valor escrito no es válido. */
  protected errorDe(p: Parametro): string | null {
    const m = this.meta(p.clave);
    const v = this.valor(p);
    if (m.tipo === 'texto') return v.length === 0 || v.length > 120 ? 'Escriba entre 1 y 120 caracteres.' : null;
    if (m.tipo === 'entero') return !/^\d+$/.test(v) || Number(v) < (m.min ?? 0) || Number(v) > (m.max ?? Number.MAX_SAFE_INTEGER) ? `Debe ser un número entero entre ${m.min} y ${m.max}.` : null;
    return null;
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<Parametro[]>('/configuracion').subscribe({
      next: (r) => {
        this.parametros.set(r);
        this.editados.set({});
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected guardar(): void {
    this.errorGuardar.set(null);
    const invalidos = this.parametros().filter((p) => p.clave in this.editados() && this.errorDe(p));
    if (invalidos.length > 0) {
      this.errorGuardar.set('Corrija los valores marcados antes de guardar.');
      return;
    }
    this.guardando.set(true);
    this.api.put<Parametro[]>('/configuracion', { valores: this.editados() }).subscribe({
      next: (r) => {
        this.guardando.set(false);
        this.parametros.set(r);
        this.editados.set({});
        this.snack.open('Parámetros guardados', 'Cerrar', { duration: 4000 });
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.errorGuardar.set(mensajeError(e));
      },
    });
  }
}
