import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { TIPOS, etiquetaTipo } from '../core/models';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina } from '../shared/piezas';

interface PlantillaVista {
  id: number;
  nombre: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  medicamento: string | null;
  presentacion: string | null;
  dosis: string | null;
  via: string | null;
  modo: string | null;
  intervaloHoras: number | null;
  duracionDias: number | null;
  activa: boolean;
}

interface MedicoDirector {
  id: number;
  nombre: string;
  especialidad: string;
  esDirector: boolean;
}

/**
 * Plantillas de indicaciones («Paracetamol cada 8 horas por 6 días», «Reposo en casa»). Las administran el
 * administrador y el director médico; los demás médicos solo las ven. Al indicar, el médico las elige o escoge «Otro».
 */
@Component({
  selector: 'app-plantillas',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatCheckboxModule],
  template: `
    <app-pagina titulo="Plantillas de indicaciones" subtitulo="Indicaciones frecuentes para que el médico no las escriba cada vez">
      @if (puede()) {
        <div acciones class="fila"><button mat-flat-button type="button" (click)="nueva()"><mat-icon>add</mat-icon> Nueva plantilla</button></div>
      } @else {
        <p class="aviso"><mat-icon>info</mat-icon> Solo el administrador y el director médico pueden crear o cambiar plantillas.</p>
      }

      @if (editando() !== null) {
        <form class="tarjeta campos" [formGroup]="f" (ngSubmit)="guardar()" novalidate>
          <h2 class="ancho">{{ editando() === 0 ? 'Nueva plantilla' : 'Editar plantilla' }}</h2>
          <mat-form-field><mat-label>Nombre en el menú</mat-label><input matInput formControlName="nombre" maxlength="100" autocomplete="off" /><mat-error>Escriba un nombre de al menos 3 caracteres.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Tipo</mat-label><mat-select formControlName="tipo">@for (t of tipos; track t.valor) { <mat-option [value]="t.valor">{{ t.etiqueta }}</mat-option> }</mat-select></mat-form-field>
          <mat-form-field class="ancho"><mat-label>Título de la indicación</mat-label><input matInput formControlName="titulo" maxlength="150" autocomplete="off" /><mat-error>Escriba un título de al menos 3 caracteres.</mat-error></mat-form-field>
          <mat-form-field class="ancho"><mat-label>Instrucciones para el paciente</mat-label><textarea matInput rows="3" formControlName="descripcion" maxlength="2000"></textarea><mat-error>Escriba las instrucciones (al menos 5 caracteres).</mat-error></mat-form-field>
          @if (f.value.tipo === 'MEDICAMENTO') {
            <mat-form-field><mat-label>Medicamento</mat-label><input matInput formControlName="medicamento" maxlength="120" autocomplete="off" /></mat-form-field>
            <mat-form-field><mat-label>Presentación</mat-label><input matInput formControlName="presentacion" maxlength="80" autocomplete="off" /></mat-form-field>
            <mat-form-field><mat-label>Dosis</mat-label><input matInput formControlName="dosis" maxlength="80" autocomplete="off" /></mat-form-field>
            <mat-form-field><mat-label>Vía</mat-label><input matInput formControlName="via" maxlength="40" autocomplete="off" /></mat-form-field>
          }
          @if (f.value.tipo === 'MEDICAMENTO' || f.value.tipo === 'RUTINA') {
            <mat-form-field><mat-label>Frecuencia</mat-label>
              <mat-select formControlName="modo"><mat-option value="">Sin horario</mat-option><mat-option value="CADA_N_HORAS">Cada cierto número de horas</mat-option><mat-option value="SEGUN_NECESIDAD">Solo si hace falta</mat-option></mat-select></mat-form-field>
            @if (f.value.modo === 'CADA_N_HORAS') {
              <mat-form-field><mat-label>Cada cuántas horas</mat-label><input matInput type="number" min="1" max="72" formControlName="intervaloHoras" /></mat-form-field>
            }
            @if (f.value.modo) {
              <mat-form-field><mat-label>Duración (días)</mat-label><input matInput type="number" min="1" max="365" formControlName="duracionDias" /></mat-form-field>
            }
          }
          @if (editando() !== 0) { <mat-checkbox formControlName="activa">Disponible para los médicos</mat-checkbox> }
          @if (errorForm()) { <p class="error ancho" role="alert">{{ errorForm() }}</p> }
          <div class="fila ancho">
            <button mat-flat-button type="submit" [disabled]="guardando()">Guardar</button>
            <button mat-button type="button" (click)="editando.set(null)">Cancelar</button>
          </div>
        </form>
      }

      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="Aún no hay plantillas." icono="content_paste" (reintento)="cargar()">
        <ul class="lista-tarjetas">
          @for (p of lista(); track p.id) {
            <li class="item">
              <span class="grande"><strong>{{ p.nombre }}</strong><small>{{ etiqueta(p.tipo) }} · {{ p.titulo }}</small><small class="muted">{{ p.descripcion }}</small></span>
              @if (!p.activa) { <app-chip etiqueta="Desactivada" color="neutro" /> }
              @if (puede()) { <button mat-stroked-button type="button" (click)="editar(p)"><mat-icon>edit</mat-icon> Editar</button> }
            </li>
          }
        </ul>
      </app-estado>

      @if (esAdmin) {
        <section class="tarjeta" aria-labelledby="dir">
          <h2 id="dir">Director médico</h2>
          <p class="muted">El director médico puede crear y editar plantillas igual que el administrador.</p>
          <ul class="lista-tarjetas">
            @for (m of medicos(); track m.id) {
              <li class="item"><span class="grande"><strong>{{ m.nombre }}</strong><small>{{ m.especialidad }}</small></span>
                <mat-checkbox [checked]="m.esDirector" (change)="director(m, $event.checked)">Director médico</mat-checkbox></li>
            }
          </ul>
        </section>
      }
    </app-pagina>
  `,
  styles: `.item { flex-wrap: wrap; } .error { color: var(--mat-sys-error, #b3261e); }`,
})
export class Plantillas {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly aviso = inject(MatSnackBar);

  protected readonly tipos = TIPOS;
  protected readonly etiqueta = etiquetaTipo;
  protected readonly esAdmin = location.pathname.startsWith('/admin');
  protected readonly lista = signal<PlantillaVista[]>([]);
  protected readonly medicos = signal<MedicoDirector[]>([]);
  protected readonly puede = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly editando = signal<number | null>(null);
  protected readonly guardando = signal(false);
  protected readonly errorForm = signal<string | null>(null);

  protected readonly f = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    tipo: ['MEDICAMENTO'],
    titulo: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    descripcion: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(2000)]],
    medicamento: [''],
    presentacion: [''],
    dosis: [''],
    via: [''],
    modo: [''],
    intervaloHoras: this.fb.control<number | null>(null),
    duracionDias: this.fb.control<number | null>(null),
    activa: [true],
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<{ puede: boolean }>('/plantillas/permiso').subscribe({
      next: ({ puede }) => {
        this.puede.set(puede);
        this.api.get<PlantillaVista[]>(puede ? '/plantillas/todas' : '/plantillas').subscribe({
          next: (r) => {
            this.lista.set(r);
            this.error.set(null);
            this.cargando.set(false);
          },
          error: (e: unknown) => {
            this.error.set(mensajeError(e));
            this.cargando.set(false);
          },
        });
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
    if (this.esAdmin) this.api.get<MedicoDirector[]>('/plantillas/medicos').subscribe((m) => this.medicos.set(m));
  }

  protected nueva(): void {
    this.f.reset({ tipo: 'MEDICAMENTO', activa: true });
    this.errorForm.set(null);
    this.editando.set(0);
  }

  protected editar(p: PlantillaVista): void {
    this.f.reset({
      nombre: p.nombre, tipo: p.tipo, titulo: p.titulo, descripcion: p.descripcion, medicamento: p.medicamento ?? '', presentacion: p.presentacion ?? '',
      dosis: p.dosis ?? '', via: p.via ?? '', modo: p.modo ?? '', intervaloHoras: p.intervaloHoras, duracionDias: p.duracionDias, activa: p.activa,
    });
    this.errorForm.set(null);
    this.editando.set(p.id);
  }

  protected guardar(): void {
    this.f.markAllAsTouched();
    if (this.f.invalid) return;
    const v = this.f.getRawValue();
    const med = v.tipo === 'MEDICAMENTO';
    const conHorario = (med || v.tipo === 'RUTINA') && !!v.modo;
    const cuerpo: Record<string, unknown> = { nombre: v.nombre, tipo: v.tipo, titulo: v.titulo, descripcion: v.descripcion };
    if (med) for (const k of ['medicamento', 'presentacion', 'dosis', 'via'] as const) if (v[k]) cuerpo[k] = v[k];
    if (conHorario) {
      cuerpo['modo'] = v.modo;
      if (v.modo === 'CADA_N_HORAS') cuerpo['intervaloHoras'] = Number(v.intervaloHoras);
      cuerpo['duracionDias'] = Number(v.duracionDias);
    }
    const id = this.editando();
    this.guardando.set(true);
    const peticion = id ? this.api.put(`/plantillas/${id}`, { ...cuerpo, activa: v.activa }) : this.api.post('/plantillas', cuerpo);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.editando.set(null);
        this.aviso.open('Plantilla guardada', 'Cerrar', { duration: 3000 });
        this.cargar();
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.errorForm.set(mensajeError(e));
      },
    });
  }

  protected director(m: MedicoDirector, v: boolean): void {
    this.api.put(`/plantillas/directores/${m.id}`, { esDirector: v }).subscribe({
      next: () => this.aviso.open(v ? `${m.nombre} es director médico` : 'Director médico retirado', 'Cerrar', { duration: 3000 }),
      error: (e: unknown) => this.aviso.open(mensajeError(e), 'Cerrar', { duration: 5000 }),
    });
  }
}
