import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { diaSemana, hoyIso, nombreMes, sumarDias, sumarMeses, ultimoDiaDelMes } from '../core/fechas';

/** Marca que se dibuja bajo el número de un día. */
export interface MarcaDia {
  /** Hay una cita ese día. */
  cita?: boolean;
  /** Cantidad de tomas del día y cuántas ya se marcaron. */
  tomas?: number;
  marcadas?: number;
  /** El día tiene horas libres para reservar. */
  libre?: boolean;
  /** El día no se puede elegir. */
  deshabilitado?: boolean;
}

/**
 * Calendario de un mes. Dibuja una cuadrícula de lunes a domingo, con puntos bajo cada día (cita, tomas, horas libres),
 * y avisa cuando se elige un día o se cambia de mes. No carga datos: quien lo usa le entrega las marcas.
 */
@Component({
  selector: 'app-calendario-mes',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="cab">
      <button mat-icon-button type="button" (click)="mesCambio.emit(anterior())" aria-label="Mes anterior"><mat-icon>chevron_left</mat-icon></button>
      <strong class="mes" aria-live="polite">{{ titulo() }}</strong>
      <button mat-icon-button type="button" (click)="mesCambio.emit(siguiente())" aria-label="Mes siguiente"><mat-icon>chevron_right</mat-icon></button>
    </div>
    <div class="rejilla" role="grid">
      @for (d of cabecera; track d) { <span class="dia-semana" role="columnheader">{{ d }}</span> }
      @for (celda of celdas(); track $index) {
        @if (celda.fecha) {
          <button type="button" class="dia" [class.hoy]="celda.hoy" [class.elegido]="celda.fecha === seleccionado()" [class.libre]="celda.marca?.libre" [disabled]="celda.marca?.deshabilitado"
            (click)="seleccion.emit(celda.fecha)" [attr.aria-label]="celda.etiqueta" [attr.aria-pressed]="celda.fecha === seleccionado()">
            <span class="num">{{ celda.numero }}</span>
            <span class="puntos">
              @if (celda.marca?.cita) { <i class="p cita" title="Cita"></i> }
              @if ((celda.marca?.tomas ?? 0) > 0) { <i class="p" [class.completo]="celda.marca?.marcadas === celda.marca?.tomas" title="Tomas"></i> }
            </span>
          </button>
        } @else { <span></span> }
      }
    </div>
  `,
  styles: `
    .cab { display: flex; align-items: center; justify-content: space-between; margin-bottom: .25rem; }
    .mes::first-letter { text-transform: uppercase; } .mes { font: var(--mat-sys-title-medium); color: var(--vn-tinta); }
    .rejilla { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .dia-semana { text-align: center; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); padding: .25rem 0; }
    .dia { display: grid; place-items: center; align-content: center; gap: 2px; min-height: 48px; border: 1px solid transparent; border-radius: 12px; background: none; color: inherit; font: inherit; cursor: pointer; padding: 2px; }
    .dia:hover:not(:disabled) { background: var(--mat-sys-surface-container-high); }
    .dia:disabled { opacity: .35; cursor: default; }
    .dia.hoy { border-color: var(--mat-sys-primary); }
    .dia.libre { background: var(--vn-suave); color: var(--mat-sys-on-primary-container); font-weight: 600; }
    .dia.elegido { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); }
    .puntos { display: flex; gap: 3px; height: 8px; }
    .p { width: 7px; height: 7px; border-radius: 50%; background: var(--mat-sys-tertiary); display: inline-block; }
    .p.cita { background: var(--mat-sys-primary); border: 1px solid var(--mat-sys-on-primary); }
    .p.completo { background: #2e7d32; }
  `,
})
export class CalendarioMes {
  /** Mes que se muestra, `AAAA-MM`. */
  readonly mes = input.required<string>();
  /** Marcas por fecha `AAAA-MM-DD`. */
  readonly marcas = input<Record<string, MarcaDia>>({});
  /** Día elegido. */
  readonly seleccionado = input<string | null>(null);
  readonly seleccion = output<string>();
  readonly mesCambio = output<string>();

  protected readonly cabecera = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  protected readonly titulo = computed(() => nombreMes(this.mes()));
  protected readonly anterior = computed(() => sumarMeses(this.mes(), -1));
  protected readonly siguiente = computed(() => sumarMeses(this.mes(), 1));

  protected readonly celdas = computed(() => {
    const primero = `${this.mes()}-01`;
    const ultimo = ultimoDiaDelMes(this.mes());
    const hoy = hoyIso();
    const celdas: Array<{ fecha: string | null; numero?: number; hoy?: boolean; marca?: MarcaDia; etiqueta?: string }> = [];
    for (let i = 1; i < diaSemana(primero); i++) celdas.push({ fecha: null });
    for (let f = primero; f <= ultimo; f = sumarDias(f, 1)) {
      const marca = this.marcas()[f];
      const partes = [`${Number(f.slice(8))} de ${nombreMes(this.mes())}`];
      if (marca?.cita) partes.push('con cita');
      if (marca?.tomas) partes.push(`${marca.marcadas ?? 0} de ${marca.tomas} tomas marcadas`);
      if (marca?.libre) partes.push('con horas disponibles');
      celdas.push({ fecha: f, numero: Number(f.slice(8)), hoy: f === hoy, marca, etiqueta: partes.join(', ') });
    }
    return celdas;
  });
}
