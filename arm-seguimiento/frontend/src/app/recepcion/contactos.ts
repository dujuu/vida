import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaCorta, fechaHora, hoyIso } from '../core/fechas';
import type { Pagina as PaginaDe } from '../core/models';
import { BuscadorPaciente, type PacienteBuscado } from '../shared/buscador-paciente';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, confirmar } from '../shared/piezas';

const MEDIOS = [
  { v: 'LLAMADA', t: 'Llamada' }, { v: 'WHATSAPP', t: 'WhatsApp' }, { v: 'CORREO', t: 'Correo' }, { v: 'PRESENCIAL', t: 'Presencial' },
];
const MOTIVOS = [
  { v: 'RESERVA', t: 'Reserva' }, { v: 'REPROGRAMACION', t: 'Reprogramación' }, { v: 'CANCELACION', t: 'Cancelación' }, { v: 'RECORDATORIO', t: 'Recordatorio' },
  { v: 'SEGUIMIENTO', t: 'Seguimiento' }, { v: 'CONSULTA', t: 'Consulta' }, { v: 'RECLAMO', t: 'Reclamo' }, { v: 'OTRO', t: 'Otro' },
];
const RESULTADOS = [
  { v: 'RESUELTO', t: 'Resuelto' }, { v: 'SIN_RESPUESTA', t: 'Sin respuesta' }, { v: 'REQUIERE_SEGUIMIENTO', t: 'Requiere seguimiento' }, { v: 'DERIVADO', t: 'Derivado' },
];
const nombre = (lista: Array<{ v: string; t: string }>, v: string) => lista.find((x) => x.v === v)?.t ?? v;

// ───────────────────────── Lista ─────────────────────────

/**
 * Contactos con los pacientes. Arriba, los pendientes (seguimientos que vencen hoy o ya vencieron, incluidos los que pidió un
 * médico); debajo, el historial con filtros. Es la trazabilidad de las llamadas, mensajes y atenciones de mesón.
 */
@Component({
  selector: 'app-contactos-recepcion',
  imports: [Pagina, Estado, ChipEstado, MatButtonModule, MatFormFieldModule, MatSelectModule, MatIconModule, MatPaginatorModule, RouterLink],
  template: `
    <app-pagina titulo="Contactos" subtitulo="Llamadas, mensajes y atención en mesón con los pacientes">
      <a acciones mat-flat-button routerLink="nuevo"><mat-icon>add</mat-icon> Registrar contacto</a>

      <h2 class="seccion">Pendientes de hoy <span class="contador">{{ pendientes().length }}</span></h2>
      <app-estado [cargando]="cargandoPend()" [error]="errorPend()" [vacio]="pendientes().length === 0" mensaje="No hay seguimientos pendientes." icono="task_alt" (reintento)="cargarPendientes()">
        <ul class="lista-tarjetas">
          @for (c of pendientes(); track c.id) {
            <li class="item" [class.destacado]="c.solicitadoPor">
              <span class="grande">
                <strong>{{ c.paciente.nombre }}</strong>
                <small>{{ medio(c.medio) }} · {{ motivo(c.motivo) }} · para el {{ fecha(c.proximoContacto) }}{{ c.solicitadoPor ? ' · pedido por un médico' : '' }}</small>
                @if (c.detalle) { <small class="detalle">{{ c.detalle }}</small> }
              </span>
              <span class="acciones-fila">
                <a mat-flat-button [routerLink]="['nuevo']" [queryParams]="{ paciente: c.paciente.id }"><mat-icon>call</mat-icon> Contactar</a>
                <button mat-stroked-button type="button" (click)="nota(c)">Agregar nota</button>
                <button mat-button type="button" (click)="cerrar(c)">Cerrar seguimiento</button>
              </span>
            </li>
          }
        </ul>
      </app-estado>

      <h2 class="seccion">Historial</h2>
      <div class="fila filtros">
        <mat-form-field class="filtro"><mat-label>Medio</mat-label>
          <mat-select [value]="fMedio()" (selectionChange)="filtrar('medio', $event.value)"><mat-option [value]="null">Todos</mat-option>@for (m of medios; track m.v) { <mat-option [value]="m.v">{{ m.t }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field class="filtro"><mat-label>Resultado</mat-label>
          <mat-select [value]="fResultado()" (selectionChange)="filtrar('resultado', $event.value)"><mat-option [value]="null">Todos</mat-option>@for (r of resultados; track r.v) { <mat-option [value]="r.v">{{ r.t }}</mat-option> }</mat-select></mat-form-field>
      </div>
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" mensaje="No hay contactos con estos filtros." icono="forum" (reintento)="cargar()">
        <ul class="lista-tarjetas">
          @for (c of lista().items; track c.id) {
            <li class="item">
              <span class="grande">
                <strong>{{ c.paciente.nombre }}</strong>
                <small>{{ medio(c.medio) }} {{ c.sentido === 'ENTRANTE' ? 'entrante' : 'saliente' }} · {{ motivo(c.motivo) }} · {{ hora(c.createdAt) }} · {{ c.responsable.nombre }}{{ c.simulado ? ' · envío simulado' : '' }}</small>
                @if (c.detalle) { <small class="detalle">{{ c.detalle }}</small> }
              </span>
              <app-chip [etiqueta]="resultado(c.resultado)" [color]="c.resultado === 'RESUELTO' ? 'ok' : c.resultado === 'DERIVADO' ? 'info' : 'aviso'" />
            </li>
          }
        </ul>
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="pagina($event)" />
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .seccion { margin: 1.5rem 0 .5rem; display: flex; align-items: center; gap: .5rem; } .contador { background: var(--vn-suave); border-radius: 999px; padding: 0 .6rem; font: var(--mat-sys-label-large); }
    .filtros { margin-bottom: .5rem; } .filtro { width: 14rem; } .item { flex-wrap: wrap; } .acciones-fila { margin-left: auto; flex-wrap: wrap; } .detalle { white-space: pre-line; }
  `,
})
export class ContactosRecepcion {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly medios = MEDIOS;
  protected readonly resultados = RESULTADOS;
  protected readonly pendientes = signal<any[]>([]);
  protected readonly lista = signal<PaginaDe<any>>({ items: [], total: 0, pagina: 1, tamano: 20 });
  protected readonly cargando = signal(true);
  protected readonly cargandoPend = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly errorPend = signal<string | null>(null);
  protected readonly fMedio = signal<string | null>(null);
  protected readonly fResultado = signal<string | null>(null);
  protected readonly medio = (v: string) => nombre(MEDIOS, v);
  protected readonly motivo = (v: string) => nombre(MOTIVOS, v);
  protected readonly resultado = (v: string) => nombre(RESULTADOS, v);
  protected readonly fecha = fechaCorta;
  protected readonly hora = (v: string) => fechaHora(v);
  private n = 1;

  constructor() {
    this.cargarPendientes();
    effect(() => {
      this.fMedio();
      this.fResultado();
      untracked(() => {
        this.n = 1;
        this.cargar();
      });
    });
  }

  protected filtrar(campo: 'medio' | 'resultado', v: string | null): void {
    (campo === 'medio' ? this.fMedio : this.fResultado).set(v);
  }

  protected pagina(e: PageEvent): void {
    this.n = e.pageIndex + 1;
    this.cargar();
  }

  protected cargarPendientes(): void {
    this.cargandoPend.set(true);
    this.api.get<any[]>('/contactos/pendientes').subscribe({
      next: (r) => {
        this.pendientes.set(r);
        this.errorPend.set(null);
        this.cargandoPend.set(false);
      },
      error: (e: unknown) => {
        this.errorPend.set(mensajeError(e));
        this.cargandoPend.set(false);
      },
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<PaginaDe<any>>('/contactos', { medio: this.fMedio() ?? undefined, resultado: this.fResultado() ?? undefined, pagina: this.n, tamano: 20 }).subscribe({
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

  private editar(id: number, cuerpo: unknown, mensaje: string): void {
    this.api.patch(`/contactos/${id}`, cuerpo).subscribe({
      next: () => {
        this.snack.open(mensaje, 'Cerrar', { duration: 3000 });
        this.cargarPendientes();
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }

  protected async nota(c: { id: number }): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Agregar una nota', texto: 'La nota se agrega al detalle; no se reemplaza lo anterior. Solo datos administrativos.', motivo: 'Nota', confirmar: 'Agregar' });
    if (r) this.editar(c.id, { agregarNota: r.motivo }, 'Nota agregada');
  }

  protected async cerrar(c: { id: number; paciente: { nombre: string } }): Promise<void> {
    const r = await confirmar(this.dialog, { titulo: 'Cerrar el seguimiento', texto: `Ya no aparecerá entre los pendientes de ${c.paciente.nombre}.`, confirmar: 'Cerrar seguimiento' });
    if (r) this.editar(c.id, { cerrado: true }, 'Seguimiento cerrado');
  }
}

// ───────────────────────── Registro ─────────────────────────

/**
 * Registro de un contacto con un paciente, con el mismo formulario para llamada, WhatsApp, correo y atención presencial. También
 * permite un envío simulado de WhatsApp o correo (no sale ningún mensaje real: queda registrado lo que se habría enviado). Antes
 * de contactar avisa si el paciente pidió no recibir recordatorios, prefiere otro medio o ya fue contactado muchas veces.
 */
@Component({
  selector: 'app-contacto-nuevo',
  imports: [Pagina, ReactiveFormsModule, BuscadorPaciente, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Registrar contacto" [volver]="true">
      @if (!paciente()) {
        <h2>¿Con qué paciente?</h2>
        <app-buscador-paciente (elegido)="elegir($event)" />
      } @else {
        <p class="paciente"><mat-icon>person</mat-icon><strong>{{ paciente()!.nombre }}</strong> · RUT {{ paciente()!.rut }}
          <button mat-button type="button" (click)="paciente.set(null); advertencias.set([])">Cambiar</button></p>

        <mat-button-toggle-group [value]="modo()" (change)="modo.set($event.value); consultarAdvertencias()" aria-label="Tipo de registro" class="modo">
          <mat-button-toggle value="registro">Registrar un contacto</mat-button-toggle>
          <mat-button-toggle value="simulado">Enviar mensaje (simulado)</mat-button-toggle>
        </mat-button-toggle-group>

        @if (advertencias().length > 0) {
          <div class="aviso aviso-error" role="alert"><mat-icon>warning</mat-icon><ul>@for (a of advertencias(); track a) { <li>{{ a }}</li> }</ul></div>
        }

        @if (modo() === 'registro') {
          <form class="tarjeta campos" [formGroup]="f" (ngSubmit)="guardar()" novalidate>
            <mat-form-field><mat-label>Medio</mat-label><mat-select formControlName="medio" (selectionChange)="consultarAdvertencias()">@for (m of medios; track m.v) { <mat-option [value]="m.v">{{ m.t }}</mat-option> }</mat-select></mat-form-field>
            <mat-form-field><mat-label>Sentido</mat-label><mat-select formControlName="sentido" (selectionChange)="consultarAdvertencias()"><mat-option value="SALIENTE">Saliente (lo contactamos)</mat-option><mat-option value="ENTRANTE">Entrante (nos contactó)</mat-option></mat-select></mat-form-field>
            <mat-form-field><mat-label>Motivo</mat-label><mat-select formControlName="motivo">@for (m of motivos; track m.v) { <mat-option [value]="m.v">{{ m.t }}</mat-option> }</mat-select></mat-form-field>
            <mat-form-field><mat-label>Resultado</mat-label><mat-select formControlName="resultado">@for (r of resultados; track r.v) { <mat-option [value]="r.v">{{ r.t }}</mat-option> }</mat-select></mat-form-field>
            <mat-form-field class="ancho"><mat-label>Detalle</mat-label><textarea matInput rows="3" formControlName="detalle" maxlength="500"></textarea><mat-hint>Solo datos administrativos: no escriba información de salud.</mat-hint></mat-form-field>
            <mat-form-field><mat-label>Próximo contacto (opcional)</mat-label><input matInput type="date" formControlName="proximoContacto" [min]="hoy" /></mat-form-field>
            @if (error()) { <p class="aviso aviso-error ancho" role="alert">{{ error() }}</p> }
            <div class="ancho acciones-fila"><button mat-flat-button type="submit" [disabled]="enviando()">Guardar contacto</button></div>
          </form>
        } @else {
          <form class="tarjeta campos" [formGroup]="s" (ngSubmit)="enviarSimulado()" novalidate>
            <p class="aviso ancho"><mat-icon>info</mat-icon> En este entorno no se envían mensajes reales: se guarda lo que se habría enviado.</p>
            <mat-form-field><mat-label>Medio</mat-label><mat-select formControlName="medio" (selectionChange)="consultarAdvertencias()"><mat-option value="WHATSAPP">WhatsApp</mat-option><mat-option value="CORREO">Correo</mat-option></mat-select></mat-form-field>
            <mat-form-field><mat-label>Motivo</mat-label><mat-select formControlName="motivo">@for (m of motivos; track m.v) { <mat-option [value]="m.v">{{ m.t }}</mat-option> }</mat-select></mat-form-field>
            <mat-form-field class="ancho"><mat-label>Mensaje</mat-label><textarea matInput rows="4" formControlName="texto" maxlength="500"></textarea><mat-hint>Sin información de salud en el texto.</mat-hint><mat-error>Escriba el mensaje (al menos 3 caracteres).</mat-error></mat-form-field>
            @if (error()) { <p class="aviso aviso-error ancho" role="alert">{{ error() }}</p> }
            <div class="ancho acciones-fila"><button mat-flat-button type="submit" [disabled]="enviando()"><mat-icon>send</mat-icon> Registrar envío simulado</button></div>
          </form>
        }
      }
    </app-pagina>
  `,
  styles: `.paciente { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; } .modo { margin: .5rem 0 1rem; } .aviso ul { margin: 0; padding-left: 1.1rem; }`,
})
export class ContactoNuevo {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Paciente ya elegido (viene de su ficha o de un pendiente). */
  readonly pacienteId = input<string>(undefined, { alias: 'paciente' });
  protected readonly medios = MEDIOS;
  protected readonly motivos = MOTIVOS;
  protected readonly resultados = RESULTADOS;
  protected readonly hoy = hoyIso();
  protected readonly modo = signal<'registro' | 'simulado'>('registro');
  protected readonly paciente = signal<{ id: number; nombre: string; rut: string } | null>(null);
  protected readonly advertencias = signal<string[]>([]);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly f = this.fb.group({
    medio: ['LLAMADA'],
    sentido: ['SALIENTE'],
    motivo: ['SEGUIMIENTO'],
    resultado: ['RESUELTO'],
    detalle: [''],
    proximoContacto: [''],
  });
  protected readonly s = this.fb.group({ medio: ['WHATSAPP'], motivo: ['RECORDATORIO'], texto: ['', [Validators.required, Validators.minLength(3)]] });

  constructor() {
    effect(() => {
      const id = this.pacienteId();
      if (!id) return;
      untracked(() =>
        this.api.get<any>(`/pacientes/${id}`).subscribe({
          next: (p) => this.fijar({ id: p.id, nombre: p.nombre, rut: p.rut }),
          error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
        }),
      );
    });
  }

  protected elegir(p: PacienteBuscado): void {
    this.fijar({ id: p.id, nombre: p.nombre, rut: p.rut });
  }

  private fijar(p: { id: number; nombre: string; rut: string }): void {
    this.paciente.set(p);
    this.consultarAdvertencias();
  }

  /** Avisa de preferencias o exceso de contactos antes de contactar. No bloquea: la persona decide. */
  protected consultarAdvertencias(): void {
    const p = this.paciente();
    if (!p) return;
    const saliente = this.modo() === 'simulado' || this.f.value.sentido === 'SALIENTE';
    if (!saliente) {
      this.advertencias.set([]);
      return;
    }
    const medio = this.modo() === 'simulado' ? this.s.value.medio : this.f.value.medio;
    this.api.get<string[]>('/contactos/advertencias', { paciente: p.id, medio }).subscribe({ next: (a) => this.advertencias.set(a), error: () => this.advertencias.set([]) });
  }

  private terminar(mensaje: string): void {
    this.snack.open(mensaje, 'Cerrar', { duration: 4000 });
    void this.router.navigateByUrl('/recepcion/contactos', { replaceUrl: true });
  }

  protected guardar(): void {
    const p = this.paciente();
    if (!p) return;
    const v = this.f.getRawValue();
    const cuerpo: Record<string, unknown> = { pacienteId: p.id, medio: v.medio, sentido: v.sentido, motivo: v.motivo, resultado: v.resultado };
    if (v.detalle) cuerpo['detalle'] = v.detalle;
    if (v.proximoContacto) cuerpo['proximoContacto'] = v.proximoContacto;
    this.enviando.set(true);
    this.error.set(null);
    this.api.post('/contactos', cuerpo).subscribe({
      next: () => this.terminar('Contacto registrado'),
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  protected enviarSimulado(): void {
    const p = this.paciente();
    if (!p) return;
    if (this.s.invalid) return this.s.markAllAsTouched();
    this.enviando.set(true);
    this.error.set(null);
    this.api.post('/contactos/simulado', { pacienteId: p.id, ...this.s.getRawValue() }).subscribe({
      next: () => this.terminar('Envío simulado registrado'),
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }
}
