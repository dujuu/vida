import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaCorta, fechaHora, horaLocal } from '../core/fechas';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, guardarArchivo } from '../shared/piezas';

/** Ficha tal como la ve el paciente: sin la anamnesis, el examen físico ni las observaciones del médico. */
interface MiFicha {
  paciente: { nombre: string; rut: string; edad: number | null; fechaNacimiento: string | null; telefono: string | null; correo: string | null };
  antecedentes: Array<{ id: number; tipo: string; descripcion: string; vigente: boolean; severidad: string | null; reaccion: string | null }>;
  atenciones: Array<{ id: number; fecha: string; medico: string; especialidad: string | null; motivo: string; diagnosticos: Array<{ descripcion: string; codigoCie10: string | null; estado: string }> }>;
  diagnosticos: Array<{ id: number; descripcion: string; estado: string }>;
  examenes: Array<{ id: number; nombre: string; tipo: string; fechaResultado: string | null; resultado: string | null }>;
  indicaciones: Array<{ id: number; titulo: string; estado: string; doctor: string; fechaInicio: string | null; fechaFin: string | null }>;
  documentos: Array<{ id: number; nombre: string; tipo: string; tamano: number; fecha: string; descripcion: string | null }>;
}

/** «Mi ficha»: lo que el paciente puede ver de su ficha clínica, con sus documentos y quién abrió su ficha. */
@Component({
  selector: 'app-mi-ficha',
  imports: [Pagina, Estado, ChipEstado, MatButtonModule, MatIconModule, MatTabsModule, RouterLink],
  template: `
    <app-pagina titulo="Mi ficha" [volver]="true" subtitulo="Su información de salud en el centro">
      <a acciones mat-stroked-button routerLink="imprimir"><mat-icon>print</mat-icon> Descargar o imprimir</a>
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (f(); as x) {
          @if (alergias().length) {
            <p class="alergia"><mat-icon>warning</mat-icon> Alergias registradas: @for (a of alergias(); track a.id) { {{ a.descripcion }}{{ a.severidad ? ' (' + a.severidad.toLowerCase() + ')' : '' }}{{ $last ? '' : ', ' }} }</p>
          }
          <mat-tab-group animationDuration="0ms">
            <mat-tab label="Atenciones">
              @if (x.atenciones.length === 0) { <p class="muted vacio">Todavía no tiene atenciones registradas.</p> }
              <ul class="lista-tarjetas pestana">
                @for (a of x.atenciones; track a.id) {
                  <li class="item"><span class="grande"><strong>{{ fecha(a.fecha) }} · {{ a.medico }}</strong><small>{{ a.especialidad }}</small><span>{{ a.motivo }}</span>
                    @for (d of a.diagnosticos; track d.descripcion) { <small>Diagnóstico: {{ d.descripcion }}</small> }</span></li>
                }
              </ul>
            </mat-tab>
            <mat-tab label="Antecedentes">
              <ul class="lista-tarjetas pestana">
                @for (a of x.antecedentes; track a.id) { <li class="item"><span class="grande"><strong>{{ a.descripcion }}</strong><small>{{ a.tipo }}{{ a.reaccion ? ' · ' + a.reaccion : '' }}</small></span>@if (!a.vigente) { <app-chip etiqueta="Cerrado" color="neutro" /> }</li> }
                @empty { <p class="muted vacio">No hay antecedentes registrados.</p> }
              </ul>
            </mat-tab>
            <mat-tab label="Exámenes">
              <ul class="lista-tarjetas pestana">
                @for (e of x.examenes; track e.id) { <li class="item"><span class="grande"><strong>{{ e.nombre }}</strong><small>{{ e.fechaResultado ? fecha(e.fechaResultado) : '' }}</small><span>{{ e.resultado }}</span></span></li> }
                @empty { <p class="muted vacio">No tiene exámenes con resultado.</p> }
              </ul>
            </mat-tab>
            <mat-tab label="Indicaciones">
              <ul class="lista-tarjetas pestana">
                @for (i of x.indicaciones; track i.id) { <li><a class="item" [routerLink]="['/paciente/indicaciones', i.id]"><span class="grande"><strong>{{ i.titulo }}</strong><small>{{ i.doctor }}</small></span><app-chip [estado]="i.estado" /></a></li> }
                @empty { <p class="muted vacio">No tiene indicaciones.</p> }
              </ul>
            </mat-tab>
            <mat-tab label="Documentos">
              <ul class="lista-tarjetas pestana">
                @for (d of x.documentos; track d.id) { <li class="item"><mat-icon>description</mat-icon><span class="grande"><strong>{{ d.nombre }}</strong><small>{{ hora(d.fecha) }} · {{ (d.tamano / 1024).toFixed(0) }} KB</small></span><button mat-stroked-button type="button" (click)="bajar(d)">Descargar</button></li> }
                @empty { <p class="muted vacio">No hay documentos.</p> }
              </ul>
            </mat-tab>
            <mat-tab label="Quién abrió mi ficha">
              <p class="muted pestana">Cada vez que un profesional abre su ficha queda registrado. Aquí ve quién y cuándo (no lo que leyó).</p>
              <ul class="lista-tarjetas">
                @for (a of accesos(); track $index) { <li class="item"><mat-icon>visibility</mat-icon><span class="grande"><strong>{{ a.usuario }}</strong><small>{{ a.rol }} · {{ hora(a.fecha) }}</small></span></li> }
                @empty { <p class="muted vacio">Nadie ha abierto su ficha todavía.</p> }
              </ul>
            </mat-tab>
          </mat-tab-group>
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `.pestana { margin: 1rem 0; } .vacio { padding: 1rem; } a.item { text-decoration: none; color: inherit; } .alergia { margin-bottom: 1rem; }`,
})
export class MiFichaPantalla {
  private readonly api = inject(Api);
  protected readonly f = signal<MiFicha | null>(null);
  protected readonly accesos = signal<Array<{ usuario: string; rol: string; fecha: string }>>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly fecha = (v: string) => fechaCorta(v.slice(0, 10) === v ? v : v.slice(0, 10));
  protected readonly hora = fechaHora;
  protected readonly horaLocal = horaLocal;

  constructor() {
    this.cargar();
    this.api.get<{ items: Array<{ usuario: string; rol: string; fecha: string }> }>('/mi-ficha/accesos', { tamano: 50 }).subscribe({ next: (r) => this.accesos.set(r.items), error: () => undefined });
  }

  protected alergias() {
    return (this.f()?.antecedentes ?? []).filter((a) => a.tipo === 'ALERGIA' && a.vigente);
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<MiFicha>('/mi-ficha').subscribe({
      next: (r) => {
        this.f.set(r);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected bajar(d: { id: number; nombre: string }): void {
    this.api.descargar(`/documentos/${d.id}/archivo`).subscribe((b) => guardarArchivo(b, d.nombre));
  }
}

/** Ficha del paciente lista para imprimir o guardar como PDF desde el navegador. */
@Component({
  selector: 'app-mi-ficha-imprimir',
  imports: [Pagina, Estado, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Mi ficha para imprimir" [volver]="true">
      <button acciones mat-flat-button type="button" class="no-imprimir" (click)="imprimir()"><mat-icon>print</mat-icon> Imprimir o guardar como PDF</button>
      <app-estado [cargando]="cargando()" [error]="error()">
        @if (f(); as x) {
          <article class="documento">
            <header><h2>{{ x.centro }}</h2><p>Ficha clínica de {{ x.paciente.nombre }} · RUT {{ x.paciente.rut }}</p><p class="muted">Generada el {{ hora(x.generadoEn) }}</p></header>
            <h3>Antecedentes</h3>
            <ul>@for (a of x.antecedentes; track a.id) { <li>{{ a.tipo }}: {{ a.descripcion }}{{ a.vigente ? '' : ' (cerrado)' }}</li> } @empty { <li>Sin antecedentes registrados</li> }</ul>
            <h3>Atenciones</h3>
            @for (a of x.atenciones; track a.id) { <p><strong>{{ hora(a.fecha) }}</strong> · {{ a.medico }} · {{ a.motivo }} @for (d of a.diagnosticos; track d.descripcion) { <br />Diagnóstico: {{ d.descripcion }} }</p> }
            <h3>Exámenes con resultado</h3>
            @for (e of x.examenes; track e.id) { <p><strong>{{ e.nombre }}</strong>: {{ e.resultado }}</p> } @empty { <p>Sin exámenes con resultado.</p> }
            <p class="muted">Este documento no incluye las notas internas del médico.</p>
          </article>
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `.documento { max-width: 760px; } h3 { margin-top: 1.25rem; }`,
})
export class MiFichaImprimir {
  private readonly api = inject(Api);
  protected readonly f = signal<(MiFicha & { centro: string; generadoEn: string }) | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly hora = fechaHora;

  constructor() {
    this.api.get<MiFicha & { centro: string; generadoEn: string }>('/mi-ficha/exportar').subscribe({
      next: (r) => {
        this.f.set(r);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected imprimir(): void {
    window.print();
  }
}
