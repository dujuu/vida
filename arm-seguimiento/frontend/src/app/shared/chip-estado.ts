import { Component, computed, input } from '@angular/core';

type Tono = 'ok' | 'aviso' | 'malo' | 'info' | 'neutro';

/** Texto y color de cada estado del sistema. El estado nunca se comunica solo con color: siempre lleva su texto. */
const ESTADOS: Record<string, { texto: string; tono: Tono }> = {
  RESERVADA: { texto: 'Reservada', tono: 'info' },
  EN_ESPERA: { texto: 'En espera', tono: 'aviso' },
  EN_ATENCION: { texto: 'En atención', tono: 'info' },
  ATENDIDA: { texto: 'Atendida', tono: 'ok' },
  CANCELADA: { texto: 'Cancelada', tono: 'neutro' },
  NO_ASISTIO: { texto: 'No asistió', tono: 'malo' },
  PENDIENTE: { texto: 'Pendiente', tono: 'neutro' },
  REALIZADA: { texto: 'Tomada', tono: 'ok' },
  OMITIDA: { texto: 'No la tomó', tono: 'aviso' },
  ANULADA: { texto: 'Anulada', tono: 'neutro' },
  ACTIVA: { texto: 'Vigente', tono: 'ok' },
  SUSPENDIDA: { texto: 'Suspendida', tono: 'aviso' },
  FINALIZADA: { texto: 'Finalizada', tono: 'neutro' },
  AL_DIA: { texto: 'Al día', tono: 'ok' },
  EN_RIESGO: { texto: 'En riesgo', tono: 'aviso' },
  DESERTOR: { texto: 'Desertor', tono: 'malo' },
  CERRADO: { texto: 'Cerrado', tono: 'neutro' },
  BORRADOR: { texto: 'Borrador', tono: 'aviso' },
  CERRADA: { texto: 'Cerrada', tono: 'ok' },
  ACTIVO: { texto: 'Activo', tono: 'info' },
  RESUELTO: { texto: 'Resuelto', tono: 'ok' },
  DESCARTADO: { texto: 'Descartado', tono: 'neutro' },
  SOLICITADO: { texto: 'Solicitado', tono: 'aviso' },
  CON_RESULTADO: { texto: 'Con resultado', tono: 'ok' },
  PERMITIDO: { texto: 'Permitido', tono: 'ok' },
  DENEGADO: { texto: 'Denegado', tono: 'malo' },
  ERROR: { texto: 'Error', tono: 'malo' },
};

/** Etiqueta con el nombre de un estado y un color. */
@Component({
  selector: 'app-chip',
  template: `<span class="chip" [class]="'chip ' + tono()">{{ texto() }}</span>`,
  styles: `
    .chip { display: inline-block; padding: .1rem .6rem; border-radius: 999px; font: var(--mat-sys-label-medium); white-space: nowrap; border: 1px solid transparent; }
    .ok { background: #e3f4e5; color: #14532d; border-color: #b7e0bd; }
    .aviso { background: #fff3d6; color: #6b4500; border-color: #f0d28a; }
    .malo { background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container); }
    .info { background: var(--vn-suave); color: var(--mat-sys-on-primary-container); }
    .neutro { background: var(--mat-sys-surface-container-high); color: var(--mat-sys-on-surface-variant); }
  `,
})
export class ChipEstado {
  readonly estado = input<string>('');
  readonly etiqueta = input<string>('');
  readonly color = input<Tono | ''>('');
  protected readonly texto = computed(() => this.etiqueta() || ESTADOS[this.estado()]?.texto || this.estado());
  protected readonly tono = computed(() => this.color() || ESTADOS[this.estado()]?.tono || 'neutro');
}
