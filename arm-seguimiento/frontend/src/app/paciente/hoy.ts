import { Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { fechaLarga, horaLocal } from '../core/fechas';
import type { Evento } from '../core/models';
import { AvisosStore } from '../shared/avisos.store';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina } from '../shared/piezas';

interface DatosHoy {
  fecha: string;
  ahora: string;
  eventos: Evento[];
  citas: Array<{ id: number; inicio: string; fin: string; estado: string; medico: string; especialidad: string | null }>;
  indicacionesSinLeer: number;
}

/** Tomas agrupadas por hora: los remedios de la misma hora se muestran juntos y generan un solo aviso. */
interface Grupo {
  instante: string;
  hora: string;
  atrasada: boolean;
  eventos: Evento[];
}

/**
 * «Hoy»: lo primero que ve el paciente. Lista lo atrasado primero, luego las tomas de hoy por hora, con botones grandes
 * «Tomada» y «No la tomé». Lo que el paciente marca es un autorreporte: la aplicación no le aconseja qué hacer ante un olvido.
 */
@Component({
  selector: 'app-hoy',
  imports: [Pagina, Estado, ChipEstado, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <app-pagina [titulo]="'Hola, ' + primerNombre()" [subtitulo]="datos() ? capitalizar(fechaLarga(datos()!.fecha)) : ''">
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (datos(); as d) {
          @if (d.indicacionesSinLeer > 0) {
            <a class="item destacado" routerLink="../indicaciones">
              <mat-icon>mark_email_unread</mat-icon>
              <span class="grande"><strong>{{ d.indicacionesSinLeer === 1 ? 'Tiene 1 indicación sin leer' : 'Tiene ' + d.indicacionesSinLeer + ' indicaciones sin leer' }}</strong><small>Tóquela para revisarla</small></span>
              <mat-icon>chevron_right</mat-icon>
            </a>
          }

          @if (d.citas.length > 0) {
            <h2 class="seccion">Citas de hoy</h2>
            <ul class="lista-tarjetas">
              @for (c of d.citas; track c.id) {
                <li class="item">
                  <span class="hora-grande">{{ hora(c.inicio) }}</span>
                  <span class="grande"><strong>{{ c.medico }}</strong><small>{{ c.especialidad }}</small></span>
                  <app-chip [estado]="c.estado" />
                </li>
              }
            </ul>
          }

          <h2 class="seccion">Sus tomas</h2>
          @if (grupos().length === 0) {
            <div class="tarjeta vacio"><mat-icon>check_circle</mat-icon><p>No tiene tomas programadas para hoy.</p></div>
          } @else {
            <ul class="lista-tarjetas">
              @for (g of grupos(); track g.instante) {
                <li class="grupo" [class.atrasada]="g.atrasada">
                  <div class="hora-cab"><span class="hora-grande">{{ g.hora }}</span> @if (g.atrasada) { <span class="etiqueta-atraso">Atrasada</span> }</div>
                  @for (e of g.eventos; track e.id) {
                    <div class="toma">
                      <div class="que">
                        <mat-icon>medication</mat-icon>
                        <span class="grande">
                          <strong>{{ e.recomendacion.medicamento || e.recomendacion.titulo }}</strong>
                          <small>{{ [e.recomendacion.presentacion, e.recomendacion.dosis, e.recomendacion.via].filter(x => x).join(' · ') }}</small>
                          <small>{{ e.recomendacion.doctor }}</small>
                        </span>
                        @if (e.estado !== 'PENDIENTE') { <app-chip [estado]="e.estado" /> }
                      </div>
                      @if (e.estado === 'PENDIENTE' && e.puedeMarcar) {
                        <div class="botones">
                          <button mat-flat-button class="boton-grande" type="button" (click)="marcar(e, 'realizada')" [disabled]="trabajando() === e.id"><mat-icon>check</mat-icon> Tomada</button>
                          <button mat-stroked-button class="boton-grande" type="button" (click)="marcar(e, 'omitida')" [disabled]="trabajando() === e.id">No la tomé</button>
                        </div>
                      } @else if (e.estado === 'PENDIENTE') {
                        <p class="muted">Todavía no es la hora de marcarla.</p>
                      } @else if (e.puedeMarcar) {
                        <button mat-button type="button" (click)="marcar(e, 'deshacer')" [disabled]="trabajando() === e.id">Deshacer</button>
                      }
                    </div>
                  }
                </li>
              }
            </ul>
            <p class="muted pie">Si tiene dudas sobre una dosis o se le olvidó una toma, consulte a su médico. La aplicación no le indica qué hacer.</p>
          }
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .seccion { margin: 1.5rem 0 .6rem; }
    a.item { text-decoration: none; color: inherit; }
    .grupo { border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; padding: .75rem 1rem; background: var(--mat-sys-surface-container-lowest); display: grid; gap: .5rem; }
    .grupo.atrasada { border-color: #d9a400; background: #fff7df; }
    .hora-cab { display: flex; align-items: center; gap: .75rem; }
    .etiqueta-atraso { background: #d9a400; color: #fff; padding: .1rem .6rem; border-radius: 999px; font: var(--mat-sys-label-medium); }
    .toma { display: grid; gap: .6rem; padding-top: .5rem; border-top: 1px dashed var(--mat-sys-outline-variant); }
    .que { display: flex; gap: .75rem; align-items: center; } .que mat-icon { color: var(--vn-tinta); }
    .botones { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
    .vacio { display: grid; justify-items: center; gap: .5rem; padding: 2rem; color: var(--mat-sys-on-surface-variant); }
    .vacio mat-icon { font-size: 2.5rem; width: 2.5rem; height: 2.5rem; color: #2e7d32; }
    .pie { margin-top: 1rem; }
  `,
})
export class Hoy {
  private readonly api = inject(Api);
  private readonly snack = inject(MatSnackBar);
  private readonly avisos = inject(AvisosStore);
  private readonly auth = inject(AuthService);
  protected readonly datos = signal<DatosHoy | null>(null);
  protected readonly grupos = signal<Grupo[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly trabajando = signal<string | null>(null);
  protected readonly fechaLarga = fechaLarga;
  protected readonly hora = horaLocal;

  constructor() {
    effect(() => {
      this.avisos.cambios();
      this.cargar(true);
    });
  }

  protected primerNombre(): string {
    return (this.auth.usuario()?.nombre ?? '').split(' ')[0];
  }

  protected capitalizar(t: string): string {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  protected cargar(silencioso = false): void {
    if (!silencioso) this.cargando.set(true);
    this.api.get<DatosHoy>('/calendario/hoy').subscribe({
      next: (d) => {
        this.datos.set(d);
        this.grupos.set(this.agrupar(d));
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        if (!silencioso) this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  /** Atrasadas primero; dentro de cada bloque, por hora. Las anuladas no se muestran en «Hoy». */
  private agrupar(d: DatosHoy): Grupo[] {
    const mapa = new Map<string, Grupo>();
    for (const e of d.eventos.filter((x) => x.estado !== 'ANULADA')) {
      const g = mapa.get(e.programadoEn) ?? { instante: e.programadoEn, hora: horaLocal(e.programadoEn), atrasada: false, eventos: [] };
      g.eventos.push(e);
      g.atrasada ||= e.atrasada;
      mapa.set(e.programadoEn, g);
    }
    return [...mapa.values()].sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || a.instante.localeCompare(b.instante));
  }

  protected marcar(e: Evento, accion: 'realizada' | 'omitida' | 'deshacer'): void {
    this.trabajando.set(e.id);
    this.api.post(`/eventos/${e.id}/${accion}`, {}).subscribe({
      next: () => {
        this.trabajando.set(null);
        this.snack.open(accion === 'realizada' ? 'Anotado: toma realizada' : accion === 'omitida' ? 'Anotado: no la tomó' : 'Volvió a pendiente', 'Cerrar');
        this.cargar(true);
        void this.avisos.cargar();
      },
      error: (err: unknown) => {
        this.trabajando.set(null);
        this.snack.open(mensajeError(err), 'Cerrar');
        this.cargar(true);
      },
    });
  }
}
