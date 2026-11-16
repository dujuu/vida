import { Component, effect, inject, input, numberAttribute, signal, untracked } from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { edadDe, fechaCorta, fechaHora, fechaLocal, hoyIso, horaLocal, iniciales, sumarDias } from '../core/fechas';
import type { Cita, Pagina as PaginaDe, Profesional } from '../core/models';
import { normalizarRut } from '../core/rut';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, RutFormato, confirmar } from '../shared/piezas';

const TELEFONO = /^[+0-9 ()-]{7,20}$/;

// ───────────────────────── Búsqueda ─────────────────────────

/** Búsqueda de pacientes por nombre o RUT. Desde aquí se abre la ficha administrativa o se registra un paciente nuevo. */
@Component({
  selector: 'app-pacientes-recepcion',
  imports: [Pagina, Estado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatPaginatorModule, RouterLink],
  template: `
    <app-pagina titulo="Pacientes" subtitulo="Datos administrativos: recepción no ve información clínica">
      <a acciones mat-flat-button routerLink="nuevo"><mat-icon>person_add</mat-icon> Registrar paciente</a>
      <mat-form-field class="buscar">
        <mat-label>Buscar por nombre o RUT</mat-label>
        <input matInput [formControl]="buscar" autocomplete="off" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" mensaje="No se encontraron pacientes." icono="group_off" (reintento)="cargar()">
        <ul class="lista-tarjetas">
          @for (p of lista().items; track p.id) {
            <li><a class="item" [routerLink]="[p.id]">
              <span class="avatar" aria-hidden="true">{{ iniciales(p.nombre) }}</span>
              <span class="grande"><strong>{{ p.nombre }}</strong><small>RUT {{ p.rut }}{{ p.fechaNacimiento ? ' · ' + edad(p.fechaNacimiento) + ' años' : '' }}{{ p.telefono ? ' · ' + p.telefono : '' }}</small></span>
              @if (p.sinActivar) { <small class="muted">Sin cuenta activada</small> }
              @if (!p.activo) { <small class="muted">Desactivado</small> }
              <mat-icon>chevron_right</mat-icon>
            </a></li>
          }
        </ul>
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="pagina($event)" />
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .buscar { width: 100%; max-width: 460px; display: block; } a.item { text-decoration: none; color: inherit; }
    .avatar { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); font-weight: 700; }
  `,
})
export class PacientesRecepcion {
  private readonly api = inject(Api);
  protected readonly buscar = new FormControl('', { nonNullable: true });
  protected readonly lista = signal<PaginaDe<any>>({ items: [], total: 0, pagina: 1, tamano: 20 });
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly iniciales = iniciales;
  protected readonly edad = (f: string) => edadDe(f);
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
    this.api.get<PaginaDe<any>>('/pacientes', { buscar: this.buscar.value.trim(), pagina: this.n, tamano: 20 }).subscribe({
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

// ───────────────────────── Registro ─────────────────────────

/**
 * Registro de un paciente nuevo. Si el RUT ya existe, no se crea un duplicado: se ofrece abrir el registro existente. Al terminar
 * se muestra el código de activación, que se entrega en persona.
 */
@Component({
  selector: 'app-paciente-nuevo',
  imports: [Pagina, ReactiveFormsModule, RutFormato, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <app-pagina titulo="Registrar paciente" [volver]="true">
      @if (creado(); as c) {
        <section class="tarjeta exito" role="status">
          <h2><mat-icon>check_circle</mat-icon> Paciente registrado</h2>
          <p><strong>{{ c.paciente.nombre }}</strong> · RUT {{ c.paciente.rut }}</p>
          <p>Código de activación (válido hasta el {{ vence(c.venceEn) }}):</p>
          <p class="codigo" aria-label="Código de activación">{{ c.codigoActivacion }}</p>
          <p class="aviso"><mat-icon>info</mat-icon> Entregue el código en persona o por teléfono al paciente. No lo envíe por mensaje. Se muestra solo ahora; si se pierde, se emite uno nuevo desde su ficha.</p>
          <div class="acciones-fila">
            <a mat-flat-button [routerLink]="['/recepcion/reservar']" [queryParams]="{ paciente: c.paciente.id }"><mat-icon>event</mat-icon> Reservar una hora</a>
            <a mat-stroked-button [routerLink]="['/recepcion/pacientes', c.paciente.id]">Ver su ficha</a>
          </div>
        </section>
      } @else {
        <form class="tarjeta campos" [formGroup]="f" (ngSubmit)="guardar()" novalidate>
          @if (duplicado(); as d) {
            <p class="aviso aviso-error ancho" role="alert"><mat-icon>warning</mat-icon>
              <span>{{ d.message }} @if (d.pacienteId) { <a [routerLink]="['/recepcion/pacientes', d.pacienteId]">Abrir el registro de {{ d.nombre }}</a> }</span></p>
          }
          <h2 class="ancho">Identificación</h2>
          <mat-form-field><mat-label>RUT</mat-label><input matInput appRut formControlName="rut" /><mat-error>Ingrese un RUT válido.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Fecha de nacimiento</mat-label><input matInput type="date" formControlName="fechaNacimiento" [max]="hoy" /><mat-error>Ingrese una fecha válida.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Nombres</mat-label><input matInput formControlName="nombres" maxlength="80" /><mat-error>Ingrese los nombres.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Apellido paterno</mat-label><input matInput formControlName="apellidoPaterno" maxlength="60" /><mat-error>Ingrese el apellido.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Apellido materno</mat-label><input matInput formControlName="apellidoMaterno" maxlength="60" /></mat-form-field>
          <mat-form-field><mat-label>Sexo</mat-label><mat-select formControlName="sexo"><mat-option value="">Sin indicar</mat-option><mat-option value="F">Femenino</mat-option><mat-option value="M">Masculino</mat-option><mat-option value="O">Otro</mat-option></mat-select></mat-form-field>

          <h2 class="ancho">Contacto</h2>
          <p class="muted ancho">Ingrese al menos un teléfono o un correo.</p>
          <mat-form-field><mat-label>Teléfono</mat-label><input matInput type="tel" formControlName="telefono" /><mat-error>El teléfono no es válido.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Correo</mat-label><input matInput type="email" formControlName="correo" /><mat-error>El correo no es válido.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Dirección</mat-label><input matInput formControlName="direccion" maxlength="200" /></mat-form-field>
          <mat-form-field><mat-label>Comuna</mat-label><input matInput formControlName="comuna" maxlength="80" /></mat-form-field>
          <mat-form-field><mat-label>Medio de contacto preferido</mat-label><mat-select formControlName="medioContacto"><mat-option value="">Sin preferencia</mat-option><mat-option value="LLAMADA">Llamada</mat-option><mat-option value="WHATSAPP">WhatsApp</mat-option><mat-option value="CORREO">Correo</mat-option></mat-select></mat-form-field>

          <h2 class="ancho">Contacto de emergencia (opcional)</h2>
          <mat-form-field><mat-label>Nombre</mat-label><input matInput formControlName="emergenciaNombre" maxlength="120" /></mat-form-field>
          <mat-form-field><mat-label>Teléfono</mat-label><input matInput type="tel" formControlName="emergenciaTelefono" /><mat-error>El teléfono no es válido.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Parentesco</mat-label><input matInput formControlName="emergenciaParentesco" maxlength="40" /></mat-form-field>

          <mat-checkbox class="ancho" formControlName="aceptaRecordatorios">Acepta recibir recordatorios de sus citas</mat-checkbox>
          <mat-checkbox class="ancho" formControlName="consentimientoPresencial">El paciente firmó el consentimiento de tratamiento de datos en el mesón</mat-checkbox>

          @if (error()) { <p class="aviso aviso-error ancho" role="alert">{{ error() }}</p> }
          <div class="ancho acciones-fila"><button mat-flat-button type="submit" [disabled]="enviando()">{{ enviando() ? 'Registrando…' : 'Registrar paciente' }}</button></div>
        </form>
      }
    </app-pagina>
  `,
  styles: `
    .exito { display: grid; gap: .5rem; } .exito h2 { display: flex; align-items: center; gap: .5rem; }
    .codigo { font: 700 2rem/1.2 ui-monospace, 'SFMono-Regular', Menlo, monospace; letter-spacing: .15em; background: var(--mat-sys-surface-container-high); padding: .75rem 1rem; border-radius: 12px; width: fit-content; user-select: all; }
  `,
})
export class PacienteNuevo {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly hoy = hoyIso();
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly duplicado = signal<{ message: string; pacienteId: number | null; nombre: string } | null>(null);
  protected readonly creado = signal<any>(null);
  protected readonly vence = (v: string) => fechaHora(v);
  protected readonly f = this.fb.group({
    rut: ['', [Validators.required, (c: { value: string }) => (normalizarRut(c.value) ? null : { rut: true })]],
    fechaNacimiento: ['', Validators.required],
    nombres: ['', [Validators.required, Validators.minLength(2)]],
    apellidoPaterno: ['', [Validators.required, Validators.minLength(2)]],
    apellidoMaterno: [''],
    sexo: [''],
    telefono: ['', Validators.pattern(TELEFONO)],
    correo: ['', Validators.email],
    direccion: [''],
    comuna: [''],
    medioContacto: [''],
    emergenciaNombre: [''],
    emergenciaTelefono: ['', Validators.pattern(TELEFONO)],
    emergenciaParentesco: [''],
    aceptaRecordatorios: [true],
    consentimientoPresencial: [false],
  });

  protected guardar(): void {
    this.duplicado.set(null);
    this.error.set(null);
    if (this.f.invalid) return this.f.markAllAsTouched();
    const v = this.f.getRawValue();
    if (!v.telefono && !v.correo) {
      this.error.set('Ingrese al menos un teléfono o un correo.');
      return;
    }
    const cuerpo: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== '' && x !== null) cuerpo[k] = x;
    this.enviando.set(true);
    this.api.post<any>('/pacientes', cuerpo).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.creado.set(r);
      },
      error: (e: { status?: number; error?: { existe?: boolean; message?: string; pacienteId?: number | null; nombre?: string } }) => {
        this.enviando.set(false);
        if (e.status === 409 && e.error?.existe) this.duplicado.set({ message: e.error.message ?? 'Ya existe ese RUT', pacienteId: e.error.pacienteId ?? null, nombre: e.error.nombre ?? '' });
        else this.error.set(mensajeError(e));
      },
    });
  }
}

// ───────────────────────── Ficha administrativa ─────────────────────────

/**
 * Ficha administrativa de un paciente: identificación y contacto (editables), próximas citas, últimos contactos y emisión del
 * código de activación o de recuperación. No muestra nada clínico.
 */
@Component({
  selector: 'app-paciente-detalle',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <app-pagina [titulo]="p()?.nombre ?? 'Paciente'" [subtitulo]="p() ? 'RUT ' + p().rut : ''" [volver]="true">
      <div acciones class="fila">
        @if (p(); as x) {
          <a mat-flat-button [routerLink]="['/recepcion/reservar']" [queryParams]="{ paciente: x.id }"><mat-icon>event</mat-icon> Reservar hora</a>
          <a mat-stroked-button [routerLink]="['/recepcion/contactos/nuevo']" [queryParams]="{ paciente: x.id }"><mat-icon>call</mat-icon> Registrar contacto</a>
        }
      </div>
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (p(); as x) {
          <section class="tarjeta cuenta">
            <div>
              <h2>Cuenta</h2>
              <p>
                @if (!x.activo) { <app-chip etiqueta="Desactivada" color="neutro" /> }
                @else if (x.sinActivar) { <app-chip etiqueta="Sin activar" color="aviso" /> }
                @else { <app-chip etiqueta="Activa" color="ok" /> }
                <span class="muted">{{ x.consentimiento ? 'Consentimiento v' + x.consentimiento.version + ' (' + x.consentimiento.medio.toLowerCase() + ') el ' + hora(x.consentimiento.aceptadoEn) : 'Sin consentimiento registrado' }}</span>
              </p>
            </div>
            @if (x.activo) { <button mat-stroked-button type="button" (click)="emitirCodigo()" [disabled]="emitiendo()"><mat-icon>key</mat-icon> {{ x.sinActivar ? 'Emitir código de activación' : 'Emitir código de recuperación' }}</button> }
          </section>

          @if (codigo(); as c) {
            <section class="tarjeta exito" role="status">
              <h2>Código {{ c.tipo === 'ACTIVACION' ? 'de activación' : 'de recuperación' }}</h2>
              <p class="codigo" aria-label="Código">{{ c.codigo }}</p>
              <p class="muted">Válido hasta el {{ hora(c.venceEn) }}. Se muestra solo ahora.</p>
              <p class="aviso"><mat-icon>info</mat-icon> Entréguelo en persona, comprobando la identidad del paciente. No lo envíe por mensaje.@if (c.tipo === 'RECUPERACION') { <span> Se cerraron las sesiones abiertas del paciente.</span> }</p>
            </section>
          }

          <form class="tarjeta campos" [formGroup]="f" (ngSubmit)="guardar()" novalidate>
            <h2 class="ancho">Datos del paciente</h2>
            <mat-form-field><mat-label>Nombres</mat-label><input matInput formControlName="nombres" maxlength="80" /></mat-form-field>
            <mat-form-field><mat-label>Apellido paterno</mat-label><input matInput formControlName="apellidoPaterno" maxlength="60" /></mat-form-field>
            <mat-form-field><mat-label>Apellido materno</mat-label><input matInput formControlName="apellidoMaterno" maxlength="60" /></mat-form-field>
            <mat-form-field><mat-label>Fecha de nacimiento</mat-label><input matInput type="date" formControlName="fechaNacimiento" [max]="hoy" /></mat-form-field>
            <mat-form-field><mat-label>Sexo</mat-label><mat-select formControlName="sexo"><mat-option value="">Sin indicar</mat-option><mat-option value="F">Femenino</mat-option><mat-option value="M">Masculino</mat-option><mat-option value="O">Otro</mat-option></mat-select></mat-form-field>
            <mat-form-field><mat-label>Teléfono</mat-label><input matInput type="tel" formControlName="telefono" /><mat-error>El teléfono no es válido.</mat-error></mat-form-field>
            <mat-form-field><mat-label>Correo</mat-label><input matInput type="email" formControlName="correo" /><mat-error>El correo no es válido.</mat-error></mat-form-field>
            <mat-form-field><mat-label>Dirección</mat-label><input matInput formControlName="direccion" maxlength="200" /></mat-form-field>
            <mat-form-field><mat-label>Comuna</mat-label><input matInput formControlName="comuna" maxlength="80" /></mat-form-field>
            <mat-form-field><mat-label>Contacto de emergencia</mat-label><input matInput formControlName="emergenciaNombre" maxlength="120" /></mat-form-field>
            <mat-form-field><mat-label>Teléfono de emergencia</mat-label><input matInput type="tel" formControlName="emergenciaTelefono" /><mat-error>El teléfono no es válido.</mat-error></mat-form-field>
            <mat-form-field><mat-label>Parentesco</mat-label><input matInput formControlName="emergenciaParentesco" maxlength="40" /></mat-form-field>
            <mat-form-field><mat-label>Medio preferido</mat-label><mat-select formControlName="medioContacto"><mat-option value="">Sin preferencia</mat-option><mat-option value="LLAMADA">Llamada</mat-option><mat-option value="WHATSAPP">WhatsApp</mat-option><mat-option value="CORREO">Correo</mat-option></mat-select></mat-form-field>
            <mat-checkbox class="ancho" formControlName="aceptaRecordatorios">Acepta recibir recordatorios</mat-checkbox>
            @if (errorGuardar()) { <p class="aviso aviso-error ancho" role="alert">{{ errorGuardar() }}</p> }
            <div class="ancho acciones-fila"><button mat-flat-button type="submit" [disabled]="f.pristine || guardando()">Guardar cambios</button></div>
          </form>

          <section class="tarjeta">
            <h2>Próximas citas</h2>
            <ul class="lista-tarjetas">
              @for (c of citas(); track c.id) {
                <li class="item"><span class="grande"><strong>{{ hora(c.inicio) }}</strong><small>{{ c.medico.nombre }}{{ c.medico.especialidad ? ' · ' + c.medico.especialidad : '' }}</small></span><app-chip [estado]="c.estado" />
                  @if (c.estado === 'RESERVADA') { <a mat-button [routerLink]="['/recepcion/citas', c.id, 'reprogramar']">Reprogramar</a> }</li>
              } @empty { <li class="muted">No tiene citas en los próximos 90 días.</li> }
            </ul>
          </section>

          <section class="tarjeta">
            <h2>Médicos que lo atienden</h2>
            <ul class="lista-tarjetas">
              @for (m of medicos(); track m.id) {
                <li class="item"><span class="grande"><strong>{{ m.nombre }}</strong><small>{{ m.especialidad }} · desde {{ hora(m.desde) }}{{ m.origen === 'MANUAL' ? ' · asignado por recepción' : '' }}</small></span>
                  <app-chip [etiqueta]="m.vigente ? 'Vigente' : 'Cerrada'" [color]="m.vigente ? 'ok' : 'neutro'" /></li>
              } @empty { <li class="muted">Todavía no tiene un médico asignado. Se asigna solo al reservar una hora, o a mano aquí.</li> }
            </ul>
            <div class="fila asignar">
              <mat-form-field class="crece"><mat-label>Asignar un médico</mat-label>
                <mat-select [value]="medicoElegido()" (selectionChange)="medicoElegido.set($event.value)">@for (m of profesionales(); track m.id) { <mat-option [value]="m.id">{{ m.nombre }} · {{ m.especialidad }}</mat-option> }</mat-select></mat-form-field>
              <button mat-stroked-button type="button" (click)="asignar()" [disabled]="!medicoElegido()">Asignar</button>
            </div>
          </section>

          <section class="tarjeta">
            <h2>Últimos contactos</h2>
            <ul class="lista-tarjetas">
              @for (c of contactos(); track c.id) {
                <li class="item"><span class="grande"><strong>{{ c.medio }} · {{ c.motivo }}</strong><small>{{ hora(c.createdAt) }} · {{ c.responsable.nombre }}{{ c.simulado ? ' · envío simulado' : '' }}</small>@if (c.detalle) { <small>{{ c.detalle }}</small> }</span><app-chip [etiqueta]="c.resultado" color="neutro" /></li>
              } @empty { <li class="muted">Sin contactos registrados.</li> }
            </ul>
          </section>
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `
    section.tarjeta, form.tarjeta { margin-bottom: 1rem; } .cuenta { display: flex; gap: 1rem; justify-content: space-between; align-items: center; flex-wrap: wrap; }
    .exito { display: grid; gap: .5rem; }
    .codigo { font: 700 2rem/1.2 ui-monospace, 'SFMono-Regular', Menlo, monospace; letter-spacing: .15em; background: var(--mat-sys-surface-container-high); padding: .75rem 1rem; border-radius: 12px; width: fit-content; user-select: all; }
    .item { flex-wrap: wrap; } .asignar { margin-top: .75rem; align-items: flex-start; gap: .75rem; flex-wrap: wrap; } .crece { flex: 1; min-width: 14rem; }
  `,
})
export class PacienteDetalle {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  /** Identificador del paciente (parámetro de la ruta). */
  readonly id = input.required({ transform: numberAttribute });
  protected readonly p = signal<any>(null);
  protected readonly citas = signal<Cita[]>([]);
  protected readonly contactos = signal<any[]>([]);
  protected readonly medicos = signal<any[]>([]);
  protected readonly profesionales = signal<Profesional[]>([]);
  protected readonly medicoElegido = signal<number | null>(null);
  protected readonly codigo = signal<{ codigo: string; venceEn: string; tipo: string } | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly errorGuardar = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly emitiendo = signal(false);
  protected readonly hoy = hoyIso();
  protected readonly hora = (v: string | Date) => fechaHora(v);
  protected readonly f = this.fb.group({
    nombres: ['', [Validators.required, Validators.minLength(2)]],
    apellidoPaterno: ['', [Validators.required, Validators.minLength(2)]],
    apellidoMaterno: [''],
    fechaNacimiento: [''],
    sexo: [''],
    telefono: ['', Validators.pattern(TELEFONO)],
    correo: ['', Validators.email],
    direccion: [''],
    comuna: [''],
    emergenciaNombre: [''],
    emergenciaTelefono: ['', Validators.pattern(TELEFONO)],
    emergenciaParentesco: [''],
    medioContacto: [''],
    aceptaRecordatorios: [true],
  });

  constructor() {
    this.api.get<Profesional[]>('/profesionales').subscribe({ next: (r) => this.profesionales.set(r), error: () => undefined });
    effect(() => {
      this.id();
      untracked(() => this.cargar());
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.codigo.set(null);
    this.api.get<any>(`/pacientes/${this.id()}`).subscribe({
      next: (p) => {
        this.p.set(p);
        this.f.reset({
          nombres: p.nombres ?? '', apellidoPaterno: p.apellidoPaterno ?? '', apellidoMaterno: p.apellidoMaterno ?? '', fechaNacimiento: p.fechaNacimiento ?? '', sexo: p.sexo ?? '',
          telefono: p.telefono ?? '', correo: p.correo ?? '', direccion: p.direccion ?? '', comuna: p.comuna ?? '', emergenciaNombre: p.emergenciaNombre ?? '',
          emergenciaTelefono: p.emergenciaTelefono ?? '', emergenciaParentesco: p.emergenciaParentesco ?? '', medioContacto: p.medioContacto ?? '', aceptaRecordatorios: p.aceptaRecordatorios,
        });
        this.error.set(null);
        this.cargando.set(false);
        this.api.get<PaginaDe<Cita>>('/citas', { paciente: this.id(), desde: this.hoy, hasta: sumarDias(this.hoy, 90), tamano: 20 }).subscribe({ next: (r) => this.citas.set(r.items.filter((c) => c.estado === 'RESERVADA' || c.estado === 'EN_ESPERA')), error: () => undefined });
        this.api.get<PaginaDe<any>>(`/pacientes/${this.id()}/contactos`, { tamano: 5 }).subscribe({ next: (r) => this.contactos.set(r.items), error: () => undefined });
        this.cargarMedicos();
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  private cargarMedicos(): void {
    this.api.get<any[]>(`/pacientes/${this.id()}/medicos`).subscribe({ next: (r) => this.medicos.set(r), error: () => undefined });
  }

  /** Crea a mano el vínculo médico–paciente (se crea solo cuando el paciente reserva con un médico). */
  protected asignar(): void {
    const medicoId = this.medicoElegido();
    if (!medicoId) return;
    this.api.post('/relaciones', { medicoId, pacienteId: this.id() }).subscribe({
      next: () => {
        this.medicoElegido.set(null);
        this.snack.open('Médico asignado', 'Cerrar', { duration: 3000 });
        this.cargarMedicos();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 }),
    });
  }

  protected guardar(): void {
    if (this.f.invalid) return this.f.markAllAsTouched();
    const cuerpo: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(this.f.getRawValue())) if (x !== '' && x !== null) cuerpo[k] = x;
    this.guardando.set(true);
    this.errorGuardar.set(null);
    this.api.patch<any>(`/pacientes/${this.id()}`, cuerpo).subscribe({
      next: () => {
        this.guardando.set(false);
        this.snack.open('Datos guardados', 'Cerrar', { duration: 3000 });
        this.cargar();
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.errorGuardar.set(mensajeError(e));
      },
    });
  }

  protected async emitirCodigo(): Promise<void> {
    const recuperacion = !this.p().sinActivar;
    const r = await confirmar(this.dialog, {
      titulo: recuperacion ? 'Emitir código de recuperación' : 'Emitir código de activación',
      texto: recuperacion
        ? 'Con este código el paciente elige una contraseña nueva y se cierran sus sesiones abiertas. Verifique su identidad antes de entregarlo.'
        : 'El paciente usará este código para crear su contraseña. Se entrega en persona.',
      confirmar: 'Emitir código',
    });
    if (!r) return;
    this.emitiendo.set(true);
    this.api.post<{ codigo: string; venceEn: string; tipo: string }>(`/pacientes/${this.id()}/codigo`).subscribe({
      next: (c) => {
        this.emitiendo.set(false);
        this.codigo.set(c);
      },
      error: (e: unknown) => {
        this.emitiendo.set(false);
        this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
      },
    });
  }
}
