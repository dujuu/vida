import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import type { Pagina } from '../core/models';

/** Paciente tal como lo ve recepción al buscarlo. */
export interface PacienteBuscado {
  id: number;
  nombre: string;
  rut: string;
  telefono: string | null;
  fechaNacimiento: string | null;
  sinActivar: boolean;
}

/**
 * Busca pacientes por nombre o RUT y avisa cuál se eligió. Muestra los resultados en una lista bajo el campo, sin salir de la
 * pantalla. Lo usan recepción (reservar, contactos) y administración.
 */
@Component({
  selector: 'app-buscador-paciente',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <mat-form-field class="campo">
      <mat-label>{{ etiqueta() }}</mat-label>
      <input matInput [formControl]="texto" autocomplete="off" placeholder="Nombre o RUT" />
      <mat-icon matSuffix>search</mat-icon>
      @if (texto.value.trim().length > 0 && texto.value.trim().length < 3) { <mat-hint>Escriba al menos 3 caracteres.</mat-hint> }
    </mat-form-field>
    @if (error()) { <p class="aviso aviso-error" role="alert">{{ error() }}</p> }
    @if (buscado()) {
      @if (resultados().length === 0) {
        <p class="muted">No se encontró ningún paciente con «{{ texto.value }}».</p>
        <ng-content select="[sinResultados]" />
      } @else {
        <ul class="lista-tarjetas resultados" role="listbox" aria-label="Pacientes encontrados">
          @for (p of resultados(); track p.id) {
            <li><button type="button" class="item opcion" role="option" (click)="elegir(p)">
              <mat-icon>person</mat-icon>
              <span class="grande"><strong>{{ p.nombre }}</strong><small>RUT {{ p.rut }}{{ p.telefono ? ' · ' + p.telefono : '' }}</small></span>
              @if (p.sinActivar) { <small class="muted">Sin cuenta activada</small> }
            </button></li>
          }
        </ul>
        @if (total() > resultados().length) { <p class="muted">Se muestran {{ resultados().length }} de {{ total() }}. Afine la búsqueda.</p> }
      }
    }
  `,
  styles: `
    .campo { width: 100%; max-width: 460px; display: block; }
    .opcion { width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer; min-height: 56px; }
    .opcion:hover { border-color: var(--mat-sys-primary); background: var(--vn-suave); }
    .resultados { max-width: 560px; }
  `,
})
export class BuscadorPaciente {
  private readonly api = inject(Api);
  readonly etiqueta = input<string>('Buscar paciente');
  readonly elegido = output<PacienteBuscado>();
  protected readonly texto = new FormControl('', { nonNullable: true });
  protected readonly resultados = signal<PacienteBuscado[]>([]);
  protected readonly total = signal(0);
  protected readonly buscado = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.texto.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe((t) => this.buscar(t.trim()));
  }

  private buscar(t: string): void {
    if (t.length < 3) {
      this.buscado.set(false);
      this.resultados.set([]);
      return;
    }
    this.api.get<Pagina<PacienteBuscado>>('/pacientes', { buscar: t, tamano: 8 }).subscribe({
      next: (r) => {
        this.resultados.set(r.items);
        this.total.set(r.total);
        this.buscado.set(true);
        this.error.set(null);
      },
      error: (e: unknown) => this.error.set(mensajeError(e)),
    });
  }

  protected elegir(p: PacienteBuscado): void {
    this.elegido.emit(p);
    this.texto.setValue('', { emitEvent: false });
    this.buscado.set(false);
    this.resultados.set([]);
  }
}
