import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaCorta } from '../core/fechas';
import type { Profesional } from '../core/models';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, confirmar } from '../shared/piezas';

// ───────────────────────── Profesionales ─────────────────────────

/** Los médicos del centro, con su especialidad y la duración de sus citas. Desde aquí se abre su agenda o su perfil. */
@Component({
  selector: 'app-profesionales-admin',
  imports: [Pagina, Estado, ChipEstado, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <app-pagina titulo="Profesionales" subtitulo="Médicos activos, su especialidad y su agenda">
      <div acciones class="fila">
        <a mat-stroked-button routerLink="/admin/catalogos"><mat-icon>tune</mat-icon> Especialidades y feriados</a>
        <a mat-flat-button routerLink="/admin/usuarios/nuevo"><mat-icon>person_add</mat-icon> Nuevo médico</a>
      </div>
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="No hay médicos activos." icono="stethoscope" (reintento)="cargar()">
        <ul class="lista-tarjetas">
          @for (m of lista(); track m.id) {
            <li class="item">
              <span class="grande"><strong>{{ m.nombre }}</strong><small>{{ m.especialidad }} · citas de {{ m.duracionCitaMin }} min</small>@if (m.presentacion) { <small class="muted">{{ m.presentacion }}</small> }</span>
              <app-chip [etiqueta]="m.aceptaReservas ? 'Acepta reservas en línea' : 'Solo por recepción'" [color]="m.aceptaReservas ? 'ok' : 'neutro'" />
              <span class="acciones-fila">
                <a mat-stroked-button [routerLink]="[m.id, 'agenda']"><mat-icon>event_available</mat-icon> Agenda</a>
                <a mat-button [routerLink]="['/admin/usuarios', m.id]">Perfil</a>
              </span>
            </li>
          }
        </ul>
      </app-estado>
    </app-pagina>
  `,
  styles: `.item { flex-wrap: wrap; } .acciones-fila { margin-left: auto; }`,
})
export class ProfesionalesAdmin {
  private readonly api = inject(Api);
  protected readonly lista = signal<Profesional[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<Profesional[]>('/profesionales').subscribe({
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
  }
}

// ───────────────────────── Especialidades y feriados ─────────────────────────

interface Especialidad {
  id: number;
  nombre: string;
  activa: boolean;
}

/** Catálogo de especialidades y feriados del centro. Un feriado no ofrece horas; una especialidad con médicos activos no se desactiva. */
@Component({
  selector: 'app-catalogos-admin',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Especialidades y feriados" [volver]="true">
      <section class="tarjeta">
        <h2>Especialidades</h2>
        <app-estado [cargando]="cargandoEsp()" [error]="errorEsp()" (reintento)="cargarEspecialidades()">
          <ul class="lista-tarjetas">
            @for (e of especialidades(); track e.id) {
              <li class="item">
                @if (editando() === e.id) {
                  <mat-form-field class="crece"><mat-label>Nombre</mat-label><input matInput [formControl]="nombreEdicion" maxlength="80" (keyup.enter)="renombrar(e)" /></mat-form-field>
                  <button mat-flat-button type="button" (click)="renombrar(e)">Guardar</button><button mat-button type="button" (click)="editando.set(null)">Cancelar</button>
                } @else {
                  <span class="grande"><strong>{{ e.nombre }}</strong></span>
                  <app-chip [etiqueta]="e.activa ? 'Activa' : 'Desactivada'" [color]="e.activa ? 'ok' : 'neutro'" />
                  <button mat-button type="button" (click)="editar(e)">Renombrar</button>
                  <button mat-button type="button" (click)="alternar(e)">{{ e.activa ? 'Desactivar' : 'Activar' }}</button>
                }
              </li>
            }
          </ul>
        </app-estado>
        <form class="fila agregar" [formGroup]="esp" (ngSubmit)="crearEspecialidad()" novalidate>
          <mat-form-field class="crece"><mat-label>Nueva especialidad</mat-label><input matInput formControlName="nombre" maxlength="80" /><mat-error>Escriba al menos 3 caracteres.</mat-error></mat-form-field>
          <button mat-flat-button type="submit">Agregar</button>
        </form>
      </section>

      <section class="tarjeta">
        <h2>Feriados</h2>
        <app-estado [cargando]="cargandoFer()" [error]="errorFer()" [vacio]="feriados().length === 0" mensaje="No hay feriados cargados." icono="event_busy" (reintento)="cargarFeriados()">
          <ul class="lista-tarjetas">
            @for (f of feriados(); track f.fecha) {
              <li class="item"><mat-icon>event_busy</mat-icon><span class="grande"><strong>{{ fecha(f.fecha) }}</strong><small>{{ f.nombre }}</small></span>
                <button mat-button type="button" class="peligro" (click)="quitarFeriado(f)">Quitar</button></li>
            }
          </ul>
        </app-estado>
        <form class="fila agregar" [formGroup]="fer" (ngSubmit)="crearFeriado()" novalidate>
          <mat-form-field><mat-label>Fecha</mat-label><input matInput type="date" formControlName="fecha" /><mat-error>Indique la fecha.</mat-error></mat-form-field>
          <mat-form-field class="crece"><mat-label>Nombre</mat-label><input matInput formControlName="nombre" maxlength="80" /><mat-error>Escriba el nombre.</mat-error></mat-form-field>
          <button mat-flat-button type="submit">Agregar</button>
        </form>
      </section>
    </app-pagina>
  `,
  styles: `section.tarjeta { margin-bottom: 1rem; } .item { flex-wrap: wrap; } .crece { flex: 1; min-width: 14rem; } .agregar { margin-top: 1rem; align-items: flex-start; gap: .75rem; flex-wrap: wrap; }`,
})
export class CatalogosAdmin {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly especialidades = signal<Especialidad[]>([]);
  protected readonly feriados = signal<Array<{ fecha: string; nombre: string }>>([]);
  protected readonly cargandoEsp = signal(true);
  protected readonly cargandoFer = signal(true);
  protected readonly errorEsp = signal<string | null>(null);
  protected readonly errorFer = signal<string | null>(null);
  protected readonly editando = signal<number | null>(null);
  protected readonly nombreEdicion = this.fb.control('', [Validators.required, Validators.minLength(3)]);
  protected readonly fecha = (f: string) => fechaCorta(f.slice(0, 10));
  protected readonly esp = this.fb.group({ nombre: ['', [Validators.required, Validators.minLength(3)]] });
  protected readonly fer = this.fb.group({ fecha: ['', Validators.required], nombre: ['', [Validators.required, Validators.maxLength(80)]] });

  constructor() {
    this.cargarEspecialidades();
    this.cargarFeriados();
  }

  private fallo = (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });

  protected cargarEspecialidades(): void {
    this.cargandoEsp.set(true);
    this.api.get<Especialidad[]>('/especialidades/todas').subscribe({
      next: (r) => {
        this.especialidades.set(r);
        this.errorEsp.set(null);
        this.cargandoEsp.set(false);
      },
      error: (e: unknown) => {
        this.errorEsp.set(mensajeError(e));
        this.cargandoEsp.set(false);
      },
    });
  }

  protected cargarFeriados(): void {
    this.cargandoFer.set(true);
    this.api.get<Array<{ fecha: string; nombre: string }>>('/feriados').subscribe({
      next: (r) => {
        this.feriados.set(r);
        this.errorFer.set(null);
        this.cargandoFer.set(false);
      },
      error: (e: unknown) => {
        this.errorFer.set(mensajeError(e));
        this.cargandoFer.set(false);
      },
    });
  }

  protected crearEspecialidad(): void {
    if (this.esp.invalid) return this.esp.markAllAsTouched();
    this.api.post('/especialidades', this.esp.getRawValue()).subscribe({
      next: () => {
        this.esp.reset();
        this.cargarEspecialidades();
      },
      error: this.fallo,
    });
  }

  protected editar(e: Especialidad): void {
    this.nombreEdicion.setValue(e.nombre);
    this.editando.set(e.id);
  }

  protected renombrar(e: Especialidad): void {
    if (this.nombreEdicion.invalid) return;
    this.api.patch(`/especialidades/${e.id}`, { nombre: this.nombreEdicion.value }).subscribe({
      next: () => {
        this.editando.set(null);
        this.cargarEspecialidades();
      },
      error: this.fallo,
    });
  }

  protected alternar(e: Especialidad): void {
    this.api.patch(`/especialidades/${e.id}`, { activa: !e.activa }).subscribe({ next: () => this.cargarEspecialidades(), error: this.fallo });
  }

  protected crearFeriado(): void {
    if (this.fer.invalid) return this.fer.markAllAsTouched();
    this.api.post('/feriados', this.fer.getRawValue()).subscribe({
      next: () => {
        this.fer.reset();
        this.cargarFeriados();
      },
      error: this.fallo,
    });
  }

  protected async quitarFeriado(f: { fecha: string; nombre: string }): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Quitar el feriado', texto: `«${f.nombre}»: ese día volverá a ofrecer horas.`, confirmar: 'Quitar' });
    if (r) this.api.delete(`/feriados/${f.fecha.slice(0, 10)}`).subscribe({ next: () => this.cargarFeriados(), error: this.fallo });
  }
}
