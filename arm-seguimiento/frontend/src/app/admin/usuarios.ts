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
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Api } from '../core/api';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { fechaHora } from '../core/fechas';
import { ETIQUETA_ROL, type Pagina as PaginaDe, type Rol } from '../core/models';
import { normalizarRut } from '../core/rut';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, RutFormato, confirmar } from '../shared/piezas';
import { nombrePersona, telefonoValido } from '../core/validadores';

const ROLES: Rol[] = ['PACIENTE', 'MEDICO', 'RECEPCIONISTA', 'ADMINISTRADOR'];

/** Crea el grupo de controles del perfil profesional de un médico. */
export function grupoPerfil(fb: NonNullableFormBuilder) {
  return fb.group({
    especialidadId: fb.control<number | null>(null, Validators.required),
    registroProfesional: [''],
    duracionCitaMin: fb.control<number | null>(30, [Validators.min(10), Validators.max(120)]),
    aceptaReservas: [true],
    presentacion: [''],
  });
}

/** Arma el cuerpo del perfil profesional a partir del formulario. */
export function cuerpoPerfil(g: ReturnType<typeof grupoPerfil>): Record<string, unknown> {
  const v = g.getRawValue();
  const c: Record<string, unknown> = { especialidadId: Number(v.especialidadId), aceptaReservas: v.aceptaReservas };
  if (v.registroProfesional) c['registroProfesional'] = v.registroProfesional;
  if (v.duracionCitaMin) c['duracionCitaMin'] = Number(v.duracionCitaMin);
  if (v.presentacion) c['presentacion'] = v.presentacion;
  return c;
}

/** Campos del perfil profesional de un médico: especialidad, registro, duración de las citas y presentación. */
@Component({
  selector: 'app-perfil-profesional',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule],
  template: `
    <div class="campos" [formGroup]="grupo()">
      <mat-form-field><mat-label>Especialidad</mat-label>
        <mat-select formControlName="especialidadId">@for (e of especialidades(); track e.id) { <mat-option [value]="e.id">{{ e.nombre }}</mat-option> }</mat-select><mat-error>Seleccione una especialidad.</mat-error></mat-form-field>
      <mat-form-field><mat-label>Registro profesional (opcional)</mat-label><input matInput formControlName="registroProfesional" maxlength="30" /></mat-form-field>
      <mat-form-field><mat-label>Duración de cada cita (minutos)</mat-label><input matInput type="number" inputmode="numeric" formControlName="duracionCitaMin" min="10" max="120" /><mat-error>Entre 10 y 120 minutos.</mat-error></mat-form-field>
      <mat-form-field class="ancho"><mat-label>Presentación para los pacientes (opcional)</mat-label><textarea matInput rows="2" formControlName="presentacion" maxlength="300"></textarea></mat-form-field>
      <mat-checkbox class="ancho" formControlName="aceptaReservas">Acepta reservas en línea de los pacientes</mat-checkbox>
    </div>
  `,
})
export class PerfilProfesionalCampos {
  readonly grupo = input.required<ReturnType<typeof grupoPerfil>>();
  readonly especialidades = input.required<Array<{ id: number; nombre: string }>>();
}

// ───────────────────────── Lista ─────────────────────────

/** Personas con acceso al sistema: filtro por rol, estado y texto. */
@Component({
  selector: 'app-usuarios-admin',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatPaginatorModule, RouterLink],
  template: `
    <app-pagina titulo="Usuarios" subtitulo="Pacientes, médicos, recepción y administración">
      <div acciones class="fila">
        <a mat-stroked-button routerLink="/admin/duplicados"><mat-icon>content_copy</mat-icon> Pacientes duplicados</a>
        <a mat-flat-button routerLink="nuevo"><mat-icon>person_add</mat-icon> Nuevo usuario</a>
      </div>
      <div class="fila filtros">
        <mat-form-field class="buscar"><mat-label>Buscar por nombre o RUT</mat-label><input matInput [formControl]="buscar" autocomplete="off" /><mat-icon matSuffix>search</mat-icon></mat-form-field>
        <mat-form-field class="filtro"><mat-label>Rol</mat-label>
          <mat-select [value]="rol()" (selectionChange)="rol.set($event.value); reiniciar()"><mat-option [value]="null">Todos</mat-option>@for (r of roles; track r) { <mat-option [value]="r">{{ etiqueta[r] }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field class="filtro"><mat-label>Estado</mat-label>
          <mat-select [value]="estado()" (selectionChange)="estado.set($event.value); reiniciar()"><mat-option [value]="null">Todos</mat-option><mat-option value="activos">Activos</mat-option><mat-option value="inactivos">Desactivados</mat-option></mat-select></mat-form-field>
      </div>
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" mensaje="No hay usuarios con estos filtros." icono="group_off" (reintento)="cargar()">
        <ul class="lista-tarjetas">
          @for (u of lista().items; track u.id) {
            <li><a class="item" [routerLink]="[u.id]">
              <span class="grande"><strong>{{ u.nombre }}</strong><small>RUT {{ u.rut }}{{ u.ultimoAcceso ? ' · último acceso ' + hora(u.ultimoAcceso) : ' · nunca ha ingresado' }}</small></span>
              <span class="roles">@for (r of u.roles; track r) { <app-chip [etiqueta]="etiqueta[r]" color="info" /> }</span>
              @if (!u.activo) { <app-chip etiqueta="Desactivado" color="neutro" /> } @else if (u.sinActivar) { <app-chip etiqueta="Sin activar" color="aviso" /> }
              <mat-icon>chevron_right</mat-icon>
            </a></li>
          }
        </ul>
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="pagina($event)" />
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .filtros { margin-bottom: .5rem; align-items: center; } .buscar { flex: 1; min-width: 14rem; max-width: 420px; } .filtro { width: 12rem; }
    a.item { text-decoration: none; color: inherit; flex-wrap: wrap; } .roles { display: flex; gap: .25rem; flex-wrap: wrap; }
  `,
})
export class UsuariosAdmin {
  private readonly api = inject(Api);
  protected readonly roles = ROLES;
  protected readonly etiqueta: Record<string, string> = ETIQUETA_ROL;
  protected readonly buscar = new FormControl('', { nonNullable: true });
  protected readonly rol = signal<Rol | null>(null);
  protected readonly estado = signal<string | null>(null);
  protected readonly lista = signal<PaginaDe<any>>({ items: [], total: 0, pagina: 1, tamano: 20 });
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly hora = (v: string) => fechaHora(v);
  private n = 1;

  constructor() {
    this.buscar.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.reiniciar());
    this.cargar();
  }

  protected reiniciar(): void {
    this.n = 1;
    this.cargar();
  }

  protected pagina(e: PageEvent): void {
    this.n = e.pageIndex + 1;
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<PaginaDe<any>>('/usuarios', { buscar: this.buscar.value.trim(), rol: this.rol() ?? undefined, estado: this.estado() ?? undefined, pagina: this.n, tamano: 20 }).subscribe({
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

// ───────────────────────── Alta ─────────────────────────

/**
 * Alta de una persona del personal o de un paciente con otro rol. Si la persona ya existe, se le agregan los roles. Al terminar se
 * muestra el código de activación, que se entrega en persona: el administrador nunca conoce la contraseña.
 */
@Component({
  selector: 'app-usuario-nuevo',
  imports: [Pagina, ReactiveFormsModule, RutFormato, PerfilProfesionalCampos, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <app-pagina titulo="Nuevo usuario" [volver]="true">
      @if (creado(); as c) {
        <section class="tarjeta exito" role="status">
          <h2><mat-icon>check_circle</mat-icon> {{ c.existente ? 'Roles agregados' : 'Usuario creado' }}</h2>
          <p><strong>{{ c.usuario.nombre }}</strong> · RUT {{ c.usuario.rut }} · {{ nombresRoles(c.usuario.roles) }}</p>
          @if (c.codigo) {
            <p>Código de activación (válido hasta el {{ hora(c.venceEn) }}):</p>
            <p class="codigo" aria-label="Código de activación">{{ c.codigo }}</p>
            <p class="aviso"><mat-icon>info</mat-icon> Entregue el código en persona. No lo envíe por mensaje. Se muestra solo ahora; si se pierde, se emite uno nuevo desde el detalle del usuario.</p>
          } @else { <p class="muted">La persona ya tenía contraseña: no necesita código.</p> }
          <div class="acciones-fila"><a mat-flat-button [routerLink]="['/admin/usuarios', c.usuario.id]">Ver usuario</a><button mat-stroked-button type="button" (click)="nuevo()">Crear otro</button></div>
        </section>
      } @else {
        <form class="tarjeta campos" [formGroup]="f" (ngSubmit)="guardar()" novalidate>
          <mat-form-field><mat-label>RUT</mat-label><input matInput appRut formControlName="rut" /><mat-error>Ingrese un RUT válido.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Tratamiento (Dr., Dra.)</mat-label><input matInput formControlName="titulo" maxlength="10" /></mat-form-field>
          <mat-form-field><mat-label>Nombres</mat-label><input matInput formControlName="nombres" maxlength="80" /><mat-error>Ingrese los nombres, solo con letras.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Apellido paterno</mat-label><input matInput formControlName="apellidoPaterno" maxlength="60" /><mat-error>Ingrese el apellido, solo con letras.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Apellido materno</mat-label><input matInput formControlName="apellidoMaterno" maxlength="60" /><mat-error>Solo letras, sin números ni signos.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Correo</mat-label><input matInput type="email" formControlName="correo" /><mat-error>El correo no es válido.</mat-error></mat-form-field>
          <mat-form-field><mat-label>Teléfono</mat-label><input matInput type="tel" formControlName="telefono" /><mat-error>Debe tener entre 8 y 12 dígitos (puede llevar + al inicio).</mat-error></mat-form-field>

          <fieldset class="ancho roles"><legend>Roles</legend>
            @for (r of roles; track r) { <mat-checkbox [checked]="seleccion().includes(r)" (change)="alternar(r, $event.checked)">{{ etiqueta[r] }}</mat-checkbox> }
            @if (rolesError()) { <span class="error-texto" role="alert">{{ rolesError() }}</span> }
          </fieldset>

          @if (seleccion().includes('MEDICO')) {
            <h2 class="ancho">Perfil profesional</h2>
            <app-perfil-profesional class="ancho" [grupo]="perfil" [especialidades]="especialidades()" />
          }
          @if (error()) { <p class="aviso aviso-error ancho" role="alert">{{ error() }}</p> }
          <div class="ancho acciones-fila"><button mat-flat-button type="submit" [disabled]="enviando()">{{ enviando() ? 'Guardando…' : 'Crear usuario' }}</button></div>
        </form>
      }
    </app-pagina>
  `,
  styles: `
    .roles { border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; display: flex; gap: 1rem; flex-wrap: wrap; padding: .5rem 1rem; } .roles legend { padding: 0 .5rem; }
    .error-texto { color: var(--mat-sys-error); font: var(--mat-sys-body-small); width: 100%; }
    .exito { display: grid; gap: .5rem; } .exito h2 { display: flex; align-items: center; gap: .5rem; }
    .codigo { font: 700 2rem/1.2 ui-monospace, 'SFMono-Regular', Menlo, monospace; letter-spacing: .15em; background: var(--mat-sys-surface-container-high); padding: .75rem 1rem; border-radius: 12px; width: fit-content; user-select: all; }
  `,
})
export class UsuarioNuevo {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly roles = ROLES;
  protected readonly etiqueta: Record<string, string> = ETIQUETA_ROL;
  protected readonly seleccion = signal<Rol[]>([]);
  protected readonly rolesError = signal<string | null>(null);
  protected readonly especialidades = signal<Array<{ id: number; nombre: string }>>([]);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly creado = signal<any>(null);
  protected readonly hora = (v: string) => fechaHora(v);
  protected readonly nombresRoles = (r: Rol[]) => r.map((x) => ETIQUETA_ROL[x]).join(', ');
  protected readonly perfil = grupoPerfil(this.fb);
  protected readonly f = this.fb.group({
    rut: ['', [Validators.required, (c: { value: string }) => (normalizarRut(c.value) ? null : { rut: true })]],
    titulo: [''],
    nombres: ['', [Validators.required, Validators.minLength(2), nombrePersona]],
    apellidoPaterno: ['', [Validators.required, Validators.minLength(2), nombrePersona]],
    apellidoMaterno: ['', nombrePersona],
    correo: ['', Validators.email],
    telefono: ['', telefonoValido],
  });

  constructor() {
    this.api.get<Array<{ id: number; nombre: string }>>('/especialidades').subscribe({ next: (r) => this.especialidades.set(r), error: () => undefined });
  }

  protected alternar(r: Rol, marcado: boolean): void {
    this.seleccion.update((s) => (marcado ? [...s, r] : s.filter((x) => x !== r)));
    this.rolesError.set(null);
  }

  protected nuevo(): void {
    this.creado.set(null);
    this.f.reset();
    this.perfil.reset({ aceptaReservas: true, duracionCitaMin: 30 });
    this.seleccion.set([]);
  }

  protected guardar(): void {
    this.error.set(null);
    const medico = this.seleccion().includes('MEDICO');
    if (this.seleccion().length === 0) this.rolesError.set('Elija al menos un rol.');
    if (this.f.invalid || this.seleccion().length === 0 || (medico && this.perfil.invalid)) {
      this.f.markAllAsTouched();
      this.perfil.markAllAsTouched();
      return;
    }
    const cuerpo: Record<string, unknown> = { roles: this.seleccion() };
    for (const [k, x] of Object.entries(this.f.getRawValue())) if (x !== '') cuerpo[k] = x;
    if (medico) cuerpo['perfilProfesional'] = cuerpoPerfil(this.perfil);
    this.enviando.set(true);
    this.api.post<any>('/usuarios', cuerpo).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.creado.set(r);
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }
}

// ───────────────────────── Detalle ─────────────────────────

/**
 * Una persona del sistema: sus datos, sus roles, el estado de su cuenta y la emisión de códigos. Emitir un código permitiría a quien
 * lo recibe fijar una contraseña nueva, por eso se confirma, se audita y debe entregarse en persona tras verificar la identidad.
 */
@Component({
  selector: 'app-usuario-detalle',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, PerfilProfesionalCampos, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <app-pagina [titulo]="u()?.nombre ?? 'Usuario'" [subtitulo]="u() ? 'RUT ' + u().rut : ''" [volver]="true">
      <app-estado [cargando]="cargando()" [error]="error()" (reintento)="cargar()">
        @if (u(); as x) {
          <section class="tarjeta cuenta">
            <div>
              <h2>Cuenta</h2>
              <p>
                @if (!x.activo) { <app-chip etiqueta="Desactivada" color="neutro" /> } @else if (x.sinActivar) { <app-chip etiqueta="Sin activar" color="aviso" /> } @else { <app-chip etiqueta="Activa" color="ok" /> }
                @for (r of x.roles; track r) { <app-chip [etiqueta]="etiqueta[r]" color="info" /> }
              </p>
              <p class="muted">{{ x.ultimoAcceso ? 'Último acceso: ' + hora(x.ultimoAcceso) : 'Nunca ha ingresado.' }}{{ x.especialidad ? ' · ' + x.especialidad : '' }}</p>
            </div>
            <div class="acciones-fila">
              @if (x.activo) { <button mat-stroked-button type="button" (click)="emitirCodigo()" [disabled]="trabajando()"><mat-icon>key</mat-icon> {{ x.sinActivar ? 'Código de activación' : 'Código de recuperación' }}</button> }
              @if (x.activo && x.id !== yo()) { <button mat-stroked-button type="button" class="peligro" (click)="cambiarEstado(false)">Desactivar</button> }
              @if (!x.activo) { <button mat-flat-button type="button" (click)="cambiarEstado(true)">Reactivar</button> }
            </div>
          </section>

          @if (codigo(); as c) {
            <section class="tarjeta exito" role="status">
              <h2>Código {{ c.tipo === 'ACTIVACION' ? 'de activación' : 'de recuperación' }}</h2>
              <p class="codigo" aria-label="Código">{{ c.codigo }}</p>
              <p class="muted">Válido hasta el {{ hora(c.venceEn) }}. Se muestra solo ahora.</p>
              <p class="aviso"><mat-icon>info</mat-icon> Entréguelo en persona, comprobando la identidad. Quien lo reciba podrá elegir una contraseña nueva.@if (c.tipo === 'RECUPERACION') { <span> Se cerraron sus sesiones abiertas.</span> }</p>
            </section>
          }

          <form class="tarjeta campos" [formGroup]="datos" (ngSubmit)="guardarDatos()" novalidate>
            <h2 class="ancho">Datos personales</h2>
            <mat-form-field><mat-label>Tratamiento</mat-label><input matInput formControlName="titulo" maxlength="10" /></mat-form-field>
            <mat-form-field><mat-label>Nombres</mat-label><input matInput formControlName="nombres" maxlength="80" /><mat-error>Solo letras, sin números ni signos.</mat-error></mat-form-field>
            <mat-form-field><mat-label>Apellido paterno</mat-label><input matInput formControlName="apellidoPaterno" maxlength="60" /><mat-error>Solo letras, sin números ni signos.</mat-error></mat-form-field>
            <mat-form-field><mat-label>Apellido materno</mat-label><input matInput formControlName="apellidoMaterno" maxlength="60" /><mat-error>Solo letras, sin números ni signos.</mat-error></mat-form-field>
            <mat-form-field><mat-label>Correo</mat-label><input matInput type="email" formControlName="correo" /><mat-error>El correo no es válido.</mat-error></mat-form-field>
            <mat-form-field><mat-label>Teléfono</mat-label><input matInput type="tel" formControlName="telefono" /><mat-error>Debe tener entre 8 y 12 dígitos (puede llevar + al inicio).</mat-error></mat-form-field>
            <div class="ancho acciones-fila"><button mat-flat-button type="submit" [disabled]="datos.pristine || trabajando()">Guardar datos</button></div>
          </form>

          <section class="tarjeta">
            <h2>Roles</h2>
            <div class="roles">@for (r of roles; track r) { <mat-checkbox [checked]="seleccion().includes(r)" (change)="alternar(r, $event.checked)">{{ etiqueta[r] }}</mat-checkbox> }</div>
            @if (seleccion().includes('MEDICO')) {
              <h3>Perfil profesional</h3>
              <app-perfil-profesional [grupo]="perfil" [especialidades]="especialidades()" />
            }
            @if (errorRoles()) { <p class="aviso aviso-error" role="alert">{{ errorRoles() }}</p> }
            <div class="acciones-fila"><button mat-flat-button type="button" (click)="guardarRoles()" [disabled]="trabajando()">Guardar roles</button>
              @if (x.roles.includes('MEDICO')) { <a mat-stroked-button [routerLink]="['/admin/profesionales', x.id, 'agenda']"><mat-icon>event_available</mat-icon> Agenda del médico</a> }</div>
          </section>
        }
      </app-estado>
    </app-pagina>
  `,
  styles: `
    section.tarjeta, form.tarjeta { margin-bottom: 1rem; } .cuenta { display: flex; gap: 1rem; justify-content: space-between; align-items: center; flex-wrap: wrap; }
    .roles { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; } .exito { display: grid; gap: .5rem; }
    .codigo { font: 700 2rem/1.2 ui-monospace, 'SFMono-Regular', Menlo, monospace; letter-spacing: .15em; background: var(--mat-sys-surface-container-high); padding: .75rem 1rem; border-radius: 12px; width: fit-content; user-select: all; }
  `,
})
export class UsuarioDetalle {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Identificador del usuario (parámetro de la ruta). */
  readonly id = input.required({ transform: numberAttribute });
  protected readonly roles = ROLES;
  protected readonly etiqueta: Record<string, string> = ETIQUETA_ROL;
  protected readonly u = signal<any>(null);
  protected readonly seleccion = signal<Rol[]>([]);
  protected readonly especialidades = signal<Array<{ id: number; nombre: string }>>([]);
  protected readonly codigo = signal<{ codigo: string; venceEn: string; tipo: string } | null>(null);
  protected readonly cargando = signal(true);
  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorRoles = signal<string | null>(null);
  protected readonly yo = () => this.auth.usuario()?.id;
  protected readonly hora = (v: string) => fechaHora(v);
  protected readonly perfil = grupoPerfil(this.fb);
  protected readonly datos = this.fb.group({
    titulo: [''],
    nombres: ['', [Validators.required, Validators.minLength(2), nombrePersona]],
    apellidoPaterno: ['', [Validators.required, Validators.minLength(2), nombrePersona]],
    apellidoMaterno: ['', nombrePersona],
    correo: ['', Validators.email],
    telefono: ['', telefonoValido],
  });

  constructor() {
    this.api.get<Array<{ id: number; nombre: string }>>('/especialidades').subscribe({ next: (r) => this.especialidades.set(r), error: () => undefined });
    effect(() => {
      this.id();
      untracked(() => this.cargar());
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.codigo.set(null);
    this.api.get<any>(`/usuarios/${this.id()}`).subscribe({
      next: (u) => {
        this.u.set(u);
        this.seleccion.set([...u.roles]);
        this.datos.reset({ titulo: u.titulo ?? '', nombres: u.nombres, apellidoPaterno: u.apellidoPaterno, apellidoMaterno: u.apellidoMaterno ?? '', correo: u.correo ?? '', telefono: u.telefono ?? '' });
        if (u.roles.includes('MEDICO')) this.cargarPerfil();
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  private cargarPerfil(): void {
    this.api.get<any>(`/profesionales/${this.id()}`).subscribe({
      next: (p) => this.perfil.reset({ especialidadId: p.especialidadId, registroProfesional: p.registroProfesional ?? '', duracionCitaMin: p.duracionCitaMin, aceptaReservas: p.aceptaReservas, presentacion: p.presentacion ?? '' }),
      error: () => undefined,
    });
  }

  protected alternar(r: Rol, marcado: boolean): void {
    this.seleccion.update((s) => (marcado ? [...s, r] : s.filter((x) => x !== r)));
  }

  private fallo = (e: unknown) => {
    this.trabajando.set(false);
    this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
  };

  protected guardarDatos(): void {
    if (this.datos.invalid) return this.datos.markAllAsTouched();
    const cuerpo: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(this.datos.getRawValue())) if (x !== '') cuerpo[k] = x;
    this.trabajando.set(true);
    this.api.patch(`/usuarios/${this.id()}`, cuerpo).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.snack.open('Datos guardados', 'Cerrar', { duration: 3000 });
        this.cargar();
      },
      error: this.fallo,
    });
  }

  protected guardarRoles(): void {
    this.errorRoles.set(null);
    if (this.seleccion().length === 0) return this.errorRoles.set('Elija al menos un rol.');
    const medico = this.seleccion().includes('MEDICO');
    if (medico && this.perfil.invalid) {
      this.perfil.markAllAsTouched();
      return this.errorRoles.set('Complete el perfil profesional.');
    }
    const cuerpo: Record<string, unknown> = { roles: this.seleccion() };
    if (medico) cuerpo['perfilProfesional'] = cuerpoPerfil(this.perfil);
    this.trabajando.set(true);
    this.api.put(`/usuarios/${this.id()}/roles`, cuerpo).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.snack.open('Roles guardados. La persona verá el cambio en su próxima sesión.', 'Cerrar', { duration: 5000 });
        this.cargar();
      },
      error: (e: unknown) => {
        this.trabajando.set(false);
        this.errorRoles.set(mensajeError(e));
      },
    });
  }

  protected async cambiarEstado(activar: boolean): Promise<void> {
    const r = await confirmar(this.dialog, {
      titulo: activar ? 'Reactivar la cuenta' : 'Desactivar la cuenta',
      texto: activar ? 'La persona podrá ingresar de nuevo.' : 'Se corta su acceso de inmediato y se cierran sus sesiones. No se borra nada.',
      confirmar: activar ? 'Reactivar' : 'Desactivar',
      peligro: !activar,
    });
    if (!r) return;
    this.api.post(`/usuarios/${this.id()}/${activar ? 'activar' : 'desactivar'}`).subscribe({ next: () => this.cargar(), error: this.fallo });
  }

  protected async emitirCodigo(): Promise<void> {
    const recuperacion = !this.u().sinActivar;
    const r = await confirmar(this.dialog, {
      titulo: recuperacion ? 'Emitir código de recuperación' : 'Emitir código de activación',
      texto: 'Con este código la persona elige una contraseña nueva. Verifique su identidad en persona antes de entregarlo. La emisión queda en la auditoría.',
      confirmar: 'Emitir código',
    });
    if (!r) return;
    this.trabajando.set(true);
    this.api.post<{ codigo: string; venceEn: string; tipo: string }>(`/usuarios/${this.id()}/codigo`).subscribe({
      next: (c) => {
        this.trabajando.set(false);
        this.codigo.set(c);
      },
      error: this.fallo,
    });
  }
}
