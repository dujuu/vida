import { Component, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaLarga, hoyIso, mesDe, ultimoDiaDelMes } from '../core/fechas';
import type { HoraLibre } from '../core/models';
import { CalendarioMes, type MarcaDia } from './calendario-mes';
import { Estado } from './piezas';

/** Hora elegida en el selector. */
export interface HoraElegida extends HoraLibre {
  fecha: string;
}

/**
 * Selector de día y hora de un médico: calendario del mes con los días que tienen horas libres, y debajo las horas del
 * día elegido. Lo usan el paciente (reservar), recepción (reservar y reprogramar). Recarga solo cuando cambia el médico o
 * el mes, y al volver a pedir `recargar` (por ejemplo, después de un conflicto 409).
 */
@Component({
  selector: 'app-selector-hora',
  imports: [CalendarioMes, MatButtonModule, Estado],
  template: `
    <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
      <app-calendario-mes [mes]="mes()" [marcas]="marcas()" [seleccionado]="dia()" (seleccion)="dia.set($event)" (mesCambio)="mes.set($event)" />
      @if (dia(); as d) {
        <h3 class="titulo-dia">{{ fechaLarga(d) }}</h3>
        @if (horasDelDia().length === 0) {
          <p class="muted">No hay horas libres este día.</p>
        } @else {
          <div class="horas" role="group" aria-label="Horas disponibles">
            @for (h of horasDelDia(); track h.inicio) {
              <button mat-stroked-button type="button" [class.elegida]="elegida()?.inicio === h.inicio" (click)="elegir(h, d)">{{ h.hora }}</button>
            }
          </div>
        }
      } @else {
        <p class="muted">Elija un día marcado para ver sus horas.</p>
      }
    </app-estado>
  `,
  styles: `
    :host { display: block; max-width: 560px; }
    .titulo-dia { margin: 1rem 0 .5rem; } .titulo-dia::first-letter { text-transform: uppercase; }
    .horas { display: flex; flex-wrap: wrap; gap: .5rem; }
    .horas button { min-width: 5rem; min-height: 48px; }
    .horas .elegida { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); }
  `,
})
export class SelectorHora {
  private readonly api = inject(Api);
  readonly medicoId = input.required<number | null>();
  /** Hora ya elegida, para resaltarla. */
  readonly elegida = input<HoraElegida | null>(null);
  /** Cambia para forzar una recarga. */
  readonly recargar = input<number>(0);
  readonly horaElegida = output<HoraElegida>();

  protected readonly mes = signal(mesDe(hoyIso()));
  protected readonly dia = signal<string | null>(null);
  protected readonly horas = signal<Array<{ fecha: string; horas: HoraLibre[] }>>([]);
  protected readonly marcas = signal<Record<string, MarcaDia>>({});
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fechaLarga = fechaLarga;

  constructor() {
    effect(() => {
      this.medicoId();
      this.mes();
      this.recargar();
      this.cargar();
    });
  }

  protected horasDelDia(): HoraLibre[] {
    return this.horas().find((d) => d.fecha === this.dia())?.horas ?? [];
  }

  protected elegir(h: HoraLibre, fecha: string): void {
    this.horaElegida.emit({ ...h, fecha });
  }

  protected cargar(): void {
    const id = this.medicoId();
    if (!id) {
      this.horas.set([]);
      this.marcas.set({});
      return;
    }
    const primero = `${this.mes()}-01`;
    const desde = primero < hoyIso() ? hoyIso() : primero;
    const hasta = ultimoDiaDelMes(this.mes());
    if (hasta < desde) {
      this.horas.set([]);
      this.marcas.set({});
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    this.api.get<Array<{ fecha: string; horas: HoraLibre[] }>>(`/agenda/${id}/horas-libres`, { desde, hasta }).subscribe({
      next: (r) => {
        this.horas.set(r);
        const m: Record<string, MarcaDia> = {};
        const dias = new Set(r.map((d) => d.fecha));
        const total = Number(hasta.slice(8));
        for (let i = 1; i <= total; i++) {
          const f = `${this.mes()}-${String(i).padStart(2, '0')}`;
          m[f] = dias.has(f) ? { libre: true } : { deshabilitado: true };
        }
        this.marcas.set(m);
        if (this.dia() && !dias.has(this.dia()!)) this.dia.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}
