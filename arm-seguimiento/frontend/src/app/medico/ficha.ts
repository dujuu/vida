import { Component, computed, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { edadDe, fechaCorta, fechaHora, fechaLocal } from '../core/fechas';
import { Estado, Pagina } from '../shared/piezas';
import { TabAntecedentes, TabAtenciones, TabDiagnosticos, TabDocumentos, TabExamenes, TabIndicaciones, TabResumen, TabSignos } from './ficha-tabs';

/**
 * Ficha clínica de un paciente. Arriba, la identificación y las alergias vigentes (siempre a la vista); debajo, una pestaña por
 * sección. Cada pestaña se carga solo cuando se abre y cada lectura queda en la auditoría.
 */
@Component({
  selector: 'app-ficha-paciente',
  imports: [Pagina, Estado, MatButtonModule, MatIconModule, MatTabsModule, RouterLink, TabResumen, TabAtenciones, TabAntecedentes, TabDiagnosticos, TabExamenes, TabDocumentos, TabIndicaciones, TabSignos],
  template: `
    <app-pagina [titulo]="r()?.identificacion?.nombre ?? 'Ficha del paciente'" [subtitulo]="subtitulo()" [volver]="true">
      <div acciones class="fila">
        @if (!r()?.soloPropio) {
          <a mat-flat-button [routerLink]="['/medico/atencion/nueva']" [queryParams]="{ paciente: id() }"><mat-icon>edit_note</mat-icon> Nueva atención</a>
        }
        <a mat-stroked-button [routerLink]="['imprimir']"><mat-icon>print</mat-icon> Imprimir</a>
      </div>

      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (r(); as x) {
          @if (alergias().length > 0) {
            <p class="alergia" role="note"><mat-icon>warning</mat-icon><span><strong>Alergias:</strong> {{ alergiasTexto() }}</span></p>
          }
          @if (x.identificacion; as i) {
            <section class="tarjeta identificacion">
              <span><small>RUT</small>{{ i.rut }}</span>
              <span><small>Edad</small>{{ i.edad ?? '–' }} años</span>
              <span><small>Sexo</small>{{ i.sexo ?? '–' }}</span>
              <span><small>Teléfono</small>{{ i.telefono ?? '–' }}</span>
              @if (i.emergencia) { <span><small>Contacto de emergencia</small>{{ i.emergencia.nombre }} · {{ i.emergencia.telefono }}</span> }
            </section>
          }

          @if (x.soloPropio) {
            <app-tab-resumen [pacienteId]="id()" [datos]="x" />
          } @else {
            <mat-tab-group dynamicHeight [selectedIndex]="pestana()" (selectedIndexChange)="pestana.set($event)" animationDuration="0ms" mat-stretch-tabs="false" mat-align-tabs="start">
              <mat-tab label="Resumen"><ng-template matTabContent><div class="panel"><app-tab-resumen [pacienteId]="id()" [datos]="x" /></div></ng-template></mat-tab>
              <mat-tab label="Atenciones"><ng-template matTabContent><div class="panel"><app-tab-atenciones [pacienteId]="id()" /></div></ng-template></mat-tab>
              <mat-tab label="Antecedentes"><ng-template matTabContent><div class="panel"><app-tab-antecedentes [pacienteId]="id()" /></div></ng-template></mat-tab>
              <mat-tab label="Diagnósticos"><ng-template matTabContent><div class="panel"><app-tab-diagnosticos [pacienteId]="id()" /></div></ng-template></mat-tab>
              <mat-tab label="Exámenes"><ng-template matTabContent><div class="panel"><app-tab-examenes [pacienteId]="id()" /></div></ng-template></mat-tab>
              <mat-tab label="Documentos"><ng-template matTabContent><div class="panel"><app-tab-documentos [pacienteId]="id()" /></div></ng-template></mat-tab>
              <mat-tab label="Indicaciones"><ng-template matTabContent><div class="panel"><app-tab-indicaciones [pacienteId]="id()" /></div></ng-template></mat-tab>
              <mat-tab label="Signos vitales"><ng-template matTabContent><div class="panel"><app-tab-signos [pacienteId]="id()" /></div></ng-template></mat-tab>
            </mat-tab-group>
          }
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .identificacion { display: flex; flex-wrap: wrap; gap: .75rem 2rem; margin-bottom: 1rem; }
    .identificacion span { display: grid; } .identificacion small { color: var(--mat-sys-on-surface-variant); }
    .alergia { display: flex; gap: .5rem; align-items: center; margin: 0 0 1rem; }
    .panel { padding-top: 1rem; }
  `,
})
export class FichaPaciente {
  private readonly api = inject(Api);
  /** Identificador del paciente (parámetro de la ruta). */
  readonly id = input.required({ transform: numberAttribute });
  protected readonly r = signal<any>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly pestana = signal(0);
  protected readonly alergias = computed<any[]>(() => this.r()?.alergias ?? []);
  protected readonly alergiasTexto = computed(() => this.alergias().map((a) => `${a.descripcion}${a.severidad ? ' (' + a.severidad.toLowerCase() + ')' : ''}`).join(' · '));
  protected readonly subtitulo = computed(() => {
    const i = this.r()?.identificacion;
    return i ? `RUT ${i.rut}${i.fechaNacimiento ? ' · nacimiento ' + fechaCorta(i.fechaNacimiento) + ' (' + edadDe(i.fechaNacimiento) + ' años)' : ''}` : '';
  });

  constructor() {
    effect(() => {
      this.id();
      this.cargar();
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<any>(`/ficha/${this.id()}`).subscribe({
      next: (r) => {
        this.r.set(r);
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

/** Ficha completa del paciente, lista para imprimir o guardar como PDF desde el navegador. La lectura queda en auditoría. */
@Component({
  selector: 'app-ficha-imprimir-medico',
  imports: [Pagina, Estado, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Ficha para imprimir" [volver]="true">
      <button acciones mat-flat-button type="button" class="no-imprimir" (click)="imprimir()" [disabled]="!f()"><mat-icon>print</mat-icon> Imprimir o guardar como PDF</button>
      <app-estado [cargando]="cargando()" [error]="error()">
        @if (f(); as x) {
          <article class="documento">
            <header>
              <h2>{{ x.centro }}</h2>
              <p><strong>Ficha clínica de {{ x.paciente.nombre }}</strong> · RUT {{ x.paciente.rut }}{{ x.paciente.edad !== null ? ' · ' + x.paciente.edad + ' años' : '' }}</p>
              <p class="muted">Generada el {{ hora(x.generadoEn) }} por {{ x.generadoPor }}. Documento confidencial.</p>
            </header>

            <h3>Antecedentes</h3>
            <ul>@for (a of x.antecedentes; track a.id) { <li>{{ a.tipo }}: {{ a.descripcion }}{{ a.severidad ? ' (' + a.severidad.toLowerCase() + ')' : '' }}{{ a.vigente ? '' : ' — cerrado' }}</li> } @empty { <li>Sin antecedentes registrados</li> }</ul>

            <h3>Diagnósticos</h3>
            <ul>@for (d of x.diagnosticos; track d.id) { <li>{{ d.descripcion }}{{ d.codigoCie10 ? ' (' + d.codigoCie10 + ')' : '' }} — {{ d.estado.toLowerCase() }}</li> } @empty { <li>Sin diagnósticos</li> }</ul>

            <h3>Atenciones</h3>
            @for (a of x.atenciones; track a.id) {
              <section class="atencion">
                <p><strong>{{ hora(a.fecha) }}</strong> · {{ a.medico }}{{ a.especialidad ? ' (' + a.especialidad + ')' : '' }}</p>
                <p><strong>Motivo:</strong> {{ a.motivo }}</p>
                @if (a.anamnesis) { <p><strong>Anamnesis:</strong> {{ a.anamnesis }}</p> }
                @if (a.examenFisico) { <p><strong>Examen físico:</strong> {{ a.examenFisico }}</p> }
                @if (a.signosVitales; as s) { <p><strong>Signos vitales:</strong> PA {{ s.paSistolica ?? '–' }}/{{ s.paDiastolica ?? '–' }} · FC {{ s.frecuenciaCardiaca ?? '–' }} · FR {{ s.frecuenciaRespiratoria ?? '–' }} · T° {{ s.temperatura ?? '–' }} · Sat {{ s.saturacion ?? '–' }}% · Peso {{ s.pesoKg ?? '–' }} kg · Talla {{ s.tallaCm ?? '–' }} cm</p> }
                @if (a.plan) { <p><strong>Plan:</strong> {{ a.plan }}</p> }
                @for (d of a.diagnosticos; track d.descripcion) { <p><strong>Diagnóstico:</strong> {{ d.descripcion }}</p> }
                @for (e of a.enmiendas; track e.fecha) { <p class="enmienda"><strong>Enmienda ({{ hora(e.fecha) }}):</strong> {{ e.texto }} <em>— {{ e.motivo }}</em></p> }
              </section>
            }

            <h3>Exámenes</h3>
            @for (e of x.examenes; track e.id) { <p><strong>{{ e.nombre }}</strong> ({{ e.estado.toLowerCase().replace('_', ' ') }}){{ e.resultado ? ': ' + e.resultado : '' }}</p> } @empty { <p>Sin exámenes.</p> }

            <h3>Indicaciones</h3>
            @for (i of x.indicaciones; track i.id) { <p><strong>{{ i.titulo }}</strong> · {{ i.doctor }} · {{ i.estado.toLowerCase() }}{{ i.medicamento ? ' · ' + i.medicamento : '' }}{{ i.dosis ? ' ' + i.dosis : '' }}</p> } @empty { <p>Sin indicaciones.</p> }
          </article>
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `.documento { max-width: 820px; } h3 { margin-top: 1.25rem; } .atencion { border-top: 1px solid var(--mat-sys-outline-variant); padding: .5rem 0; break-inside: avoid; } .atencion p { margin: .25rem 0; white-space: pre-line; } .enmienda { color: var(--mat-sys-on-surface-variant); }`,
})
export class FichaImprimirMedico {
  private readonly api = inject(Api);
  readonly id = input.required({ transform: numberAttribute });
  protected readonly f = signal<any>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly hora = fechaHora;
  protected readonly dia = (v: string) => fechaCorta(fechaLocal(v));

  constructor() {
    effect(() => {
      this.api.get<any>(`/ficha/${this.id()}/exportar`).subscribe({
        next: (r) => {
          this.f.set(r);
          this.cargando.set(false);
        },
        error: (e: unknown) => {
          this.error.set(mensajeError(e));
          this.cargando.set(false);
        },
      });
    });
  }

  protected imprimir(): void {
    window.print();
  }
}
