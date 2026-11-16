import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { edadDe, fechaHora, iniciales } from '../core/fechas';
import type { Pagina as PaginaDe } from '../core/models';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina } from '../shared/piezas';

interface PacienteDeMedico {
  id: number;
  nombre: string;
  rut: string;
  fechaNacimiento: string | null;
  relacionVigente: boolean;
  proximaCita: string | null;
  indicacionesSinLeer: number;
}

/** Los pacientes del médico, con búsqueda por nombre o RUT. Un médico solo ve a los pacientes con los que tiene relación. */
@Component({
  selector: 'app-pacientes-medico',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule, MatSlideToggleModule, MatPaginatorModule, RouterLink],
  template: `
    <app-pagina titulo="Mis pacientes" subtitulo="Solo los pacientes con los que tiene una relación de atención">
      <div class="fila filtros">
        <mat-form-field class="buscar">
          <mat-label>Buscar por nombre o RUT</mat-label>
          <input matInput [formControl]="buscar" autocomplete="off" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <mat-slide-toggle [checked]="cerradas()" (change)="cerradas.set($event.checked); cargar()">Incluir relaciones cerradas</mat-slide-toggle>
      </div>
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" mensaje="No se encontraron pacientes." icono="group" (reintento)="cargar()">
        <ul class="lista-tarjetas">
          @for (p of lista().items; track p.id) {
            <li>
              <a class="item" [routerLink]="[p.id]">
                <span class="avatar" aria-hidden="true">{{ iniciales(p.nombre) }}</span>
                <span class="grande"><strong>{{ p.nombre }}</strong><small>RUT {{ p.rut }}{{ p.fechaNacimiento ? ' · ' + edad(p.fechaNacimiento) + ' años' : '' }}</small>
                  <small>{{ p.proximaCita ? 'Próxima cita: ' + hora(p.proximaCita) : 'Sin cita futura' }}</small></span>
                @if (p.indicacionesSinLeer > 0) { <app-chip [etiqueta]="p.indicacionesSinLeer + ' sin leer'" color="aviso" /> }
                @if (!p.relacionVigente) { <app-chip etiqueta="Relación cerrada" color="neutro" /> }
                <mat-icon>chevron_right</mat-icon>
              </a>
            </li>
          }
        </ul>
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="pagina($event)" />
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .filtros { margin-bottom: 1rem; } .buscar { max-width: 420px; flex: 1; }
    a.item { text-decoration: none; color: inherit; flex-wrap: wrap; }
    .avatar { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); font-weight: 700; }
  `,
})
export class PacientesMedico {
  private readonly api = inject(Api);
  protected readonly buscar = new FormControl('', { nonNullable: true });
  protected readonly cerradas = signal(false);
  protected readonly lista = signal<PaginaDe<PacienteDeMedico>>({ items: [], total: 0, pagina: 1, tamano: 20 });
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly iniciales = iniciales;
  protected readonly edad = (f: string) => edadDe(f);
  protected readonly hora = fechaHora;
  private n = 1;

  constructor() {
    this.buscar.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      this.n = 1;
      this.cargar();
    });
    this.cargar();
  }

  protected pagina(e: PageEvent): void {
    this.n = e.pageIndex + 1;
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<PaginaDe<PacienteDeMedico>>('/medico/pacientes', { buscar: this.buscar.value, cerradas: this.cerradas() || undefined, pagina: this.n, tamano: 20 }).subscribe({
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
