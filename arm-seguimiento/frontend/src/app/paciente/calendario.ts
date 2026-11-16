import { Component, effect, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaLarga, hoyIso, horaLocal, mesDe, sumarMeses } from '../core/fechas';
import type { Evento } from '../core/models';
import { CalendarioMes, type MarcaDia } from '../shared/calendario-mes';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina } from '../shared/piezas';

interface DiaDetalle {
  eventos: Evento[];
  citas: Array<{ id: number; inicio: string; estado: string; medico: string }>;
  indicacionesVigentes: Array<{ id: number; titulo: string; tipo: string; doctor: string }>;
}

/** Calendario del paciente: el mes con puntos por día y, al elegir un día, sus tomas, citas e indicaciones vigentes. */
@Component({
  selector: 'app-calendario',
  imports: [Pagina, Estado, CalendarioMes, ChipEstado, MatIconModule, RouterLink],
  template: `
    <app-pagina titulo="Calendario" subtitulo="Sus tomas y citas. El punto verde indica que marcó todas las tomas del día.">
      <div class="rejilla-2">
        <section class="tarjeta">
          <app-estado [error]="error()" (reintento)="cargarMes()">
            <app-calendario-mes [mes]="mes()" [marcas]="marcas()" [seleccionado]="dia()" (seleccion)="elegir($event)" (mesCambio)="mes.set($event)" />
          </app-estado>
        </section>
        <section class="tarjeta">
          @if (dia(); as d) {
            <h2>{{ fechaLarga(d) }}</h2>
            <app-estado [cargando]="cargandoDia()" [vacio]="vacioDia()" mensaje="No hay nada programado este día.">
              @for (c of detalle()?.citas ?? []; track c.id) {
                <div class="item"><span class="hora-grande">{{ hora(c.inicio) }}</span><span class="grande"><strong>Cita con {{ c.medico }}</strong></span><app-chip [estado]="c.estado" /></div>
              }
              @for (e of detalle()?.eventos ?? []; track e.id) {
                <div class="item" [class.alerta]="e.atrasada">
                  <span class="hora-grande">{{ hora(e.programadoEn) }}</span>
                  <span class="grande"><strong>{{ e.recomendacion.medicamento || e.recomendacion.titulo }}</strong><small>{{ [e.recomendacion.dosis, e.recomendacion.via].filter(x => x).join(' · ') }}</small>@if (e.estado === 'ANULADA') { <small>{{ e.motivoAnulacion }}</small> }</span>
                  <app-chip [estado]="e.estado" />
                </div>
              }
              @for (i of detalle()?.indicacionesVigentes ?? []; track i.id) {
                <a class="item" [routerLink]="['../indicaciones', i.id]"><mat-icon>sticky_note_2</mat-icon><span class="grande"><strong>{{ i.titulo }}</strong><small>Indicación vigente · {{ i.doctor }}</small></span><mat-icon>chevron_right</mat-icon></a>
              }
            </app-estado>
          } @else { <p class="muted">Elija un día para ver sus detalles.</p> }
        </section>
      </div>
      <p class="muted pie"><a routerLink="../indicaciones" [queryParams]="{ ver: 'anteriores' }">Ver tratamientos anteriores</a></p>
    </app-pagina>
  `,
  styles: `
    a.item { text-decoration: none; color: inherit; margin-bottom: .5rem; } .item { margin-bottom: .5rem; }
    .pie { margin-top: 1rem; } .pie a { color: var(--vn-tinta); font-weight: 600; }
  `,
})
export class CalendarioPaciente {
  private readonly api = inject(Api);
  protected readonly mes = signal(mesDe(hoyIso()));
  protected readonly dia = signal<string | null>(hoyIso());
  protected readonly marcas = signal<Record<string, MarcaDia>>({});
  protected readonly detalle = signal<DiaDetalle | null>(null);
  protected readonly cargandoDia = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fechaLarga = fechaLarga;
  protected readonly hora = horaLocal;
  protected readonly sumar = sumarMeses;

  constructor() {
    effect(() => {
      this.mes();
      this.cargarMes();
    });
    effect(() => {
      const d = this.dia();
      if (d) this.cargarDia(d);
    });
  }

  protected vacioDia(): boolean {
    const d = this.detalle();
    return !!d && d.eventos.length + d.citas.length + d.indicacionesVigentes.length === 0;
  }

  protected elegir(f: string): void {
    this.dia.set(f);
    if (mesDe(f) !== this.mes()) this.mes.set(mesDe(f));
  }

  protected cargarMes(): void {
    this.api.get<Array<{ fecha: string; tomas: number; marcadas: number; hayCita: boolean }>>('/calendario/resumen-mes', { mes: this.mes() }).subscribe({
      next: (r) => {
        const m: Record<string, MarcaDia> = {};
        for (const d of r) m[d.fecha] = { cita: d.hayCita, tomas: d.tomas, marcadas: d.marcadas };
        this.marcas.set(m);
        this.error.set(null);
      },
      error: (e: unknown) => this.error.set(mensajeError(e)),
    });
  }

  private cargarDia(d: string): void {
    this.cargandoDia.set(true);
    this.api.get<DiaDetalle>('/calendario', { desde: d, hasta: d }).subscribe({
      next: (r) => {
        this.detalle.set(r);
        this.cargandoDia.set(false);
      },
      error: () => this.cargandoDia.set(false),
    });
  }
}
