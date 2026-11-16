import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api, aParametros } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaHora } from '../core/fechas';
import { ETIQUETA_ROL, type Pagina as PaginaDe, type Rol } from '../core/models';
import { BuscadorPaciente, type PacienteBuscado } from '../shared/buscador-paciente';
import { ChipEstado } from '../shared/chip-estado';
import { Estado, Pagina, guardarArchivo } from '../shared/piezas';

/** Acciones que registra la auditoría, con su nombre en palabras. */
const ACCIONES: ReadonlyArray<[string, string]> = [
  ['LOGIN_OK', 'Inicio de sesión'], ['LOGIN_FALLIDO', 'Inicio de sesión fallido'], ['LOGIN_BLOQUEADO', 'Cuenta bloqueada'], ['LOGOUT', 'Cierre de sesión'],
  ['CAMBIO_ROL', 'Cambio de perfil'], ['ACTIVACION', 'Activación de cuenta'], ['CAMBIO_PASSWORD', 'Cambio de contraseña'], ['SESION_REVOCADA', 'Sesión revocada'],
  ['CLAVE_UNICA_SIMULADA', 'Clave Única simulada'], ['USUARIO_CREAR', 'Usuario creado'], ['USUARIO_EDITAR', 'Usuario editado'], ['USUARIO_ROLES', 'Roles modificados'],
  ['USUARIO_ESTADO', 'Cuenta activada o desactivada'], ['CODIGO_EMITIR', 'Código emitido'], ['PACIENTE_CREAR', 'Paciente registrado'], ['PACIENTE_EDITAR', 'Paciente editado'],
  ['PACIENTE_LEER', 'Paciente consultado'], ['PACIENTE_FUSIONAR', 'Pacientes fusionados'], ['PERFIL_PROFESIONAL', 'Perfil profesional'], ['RELACION_CREAR', 'Relación creada'],
  ['RELACION_CERRAR', 'Relación cerrada'], ['AGENDA_EDITAR', 'Agenda editada'], ['CITA_RESERVAR', 'Cita reservada'], ['CITA_CANCELAR', 'Cita cancelada'],
  ['CITA_REPROGRAMAR', 'Cita reprogramada'], ['CITA_ESTADO', 'Cambio de estado de cita'], ['CONTACTO_CREAR', 'Contacto registrado'], ['CONTACTO_EDITAR', 'Contacto editado'],
  ['FICHA_LEER', 'Ficha consultada'], ['FICHA_ESCRIBIR', 'Ficha modificada'], ['FICHA_EXPORTAR', 'Ficha exportada'], ['DOCUMENTO_DESCARGAR', 'Documento descargado'],
  ['INDICACION_LEER', 'Indicación consultada'], ['INDICACION_ESCRIBIR', 'Indicación modificada'], ['TOMA_MARCAR', 'Toma marcada'], ['SEGUIMIENTO_LEER', 'Seguimiento consultado'],
  ['CONFIGURACION_EDITAR', 'Parámetro modificado'], ['AUDITORIA_CONSULTAR', 'Auditoría consultada'], ['ACCESO_DENEGADO', 'Acceso denegado'],
];
const NOMBRE_ACCION = new Map(ACCIONES);

/**
 * Registro de auditoría: quién hizo qué, cuándo y con qué resultado. El registro no se puede modificar ni borrar y nunca contiene
 * información clínica, solo la acción y el recurso afectado. Se puede filtrar y descargar en CSV.
 */
@Component({
  selector: 'app-auditoria-admin',
  imports: [Pagina, Estado, ChipEstado, ReactiveFormsModule, BuscadorPaciente, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatPaginatorModule],
  template: `
    <app-pagina titulo="Auditoría" subtitulo="Registro inalterable de accesos y cambios. No contiene información clínica.">
      <button acciones mat-stroked-button type="button" (click)="descargar()" [disabled]="descargando()"><mat-icon>download</mat-icon> Descargar CSV</button>

      <form class="tarjeta filtros" [formGroup]="f" (ngSubmit)="aplicar()">
        <mat-form-field><mat-label>Acción</mat-label>
          <mat-select formControlName="accion"><mat-option value="">Todas</mat-option>@for (a of acciones; track a[0]) { <mat-option [value]="a[0]">{{ a[1] }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field><mat-label>Resultado</mat-label>
          <mat-select formControlName="resultado"><mat-option value="">Todos</mat-option><mat-option value="PERMITIDO">Permitido</mat-option><mat-option value="DENEGADO">Denegado</mat-option><mat-option value="ERROR">Error</mat-option></mat-select></mat-form-field>
        <mat-form-field><mat-label>Desde</mat-label><input matInput type="date" formControlName="desde" /></mat-form-field>
        <mat-form-field><mat-label>Hasta</mat-label><input matInput type="date" formControlName="hasta" /></mat-form-field>
        <div class="paciente">
          @if (paciente(); as p) {
            <span class="filtro-paciente"><mat-icon>person</mat-icon> Accesos al paciente: <strong>{{ p.nombre }}</strong> <button mat-icon-button type="button" (click)="quitarPaciente()" aria-label="Quitar el filtro de paciente"><mat-icon>close</mat-icon></button></span>
          } @else { <app-buscador-paciente etiqueta="Filtrar por paciente (accesos a su ficha)" (elegido)="elegirPaciente($event)" /> }
        </div>
        <div class="acciones-fila"><button mat-flat-button type="submit">Aplicar filtros</button><button mat-button type="button" (click)="limpiar()">Limpiar</button></div>
      </form>

      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().total === 0" mensaje="No hay eventos con estos filtros." icono="fact_check" (reintento)="cargar()">
        <p class="muted">{{ lista().total }} evento(s).</p>
        <div class="tabla-scroll">
          <table class="tabla">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Recurso</th><th>Paciente</th><th>Resultado</th><th>IP</th><th>Detalle</th></tr></thead>
            <tbody>
              @for (r of lista().items; track r.id) {
                <tr>
                  <td class="nowrap">{{ hora(r.fecha) }}</td>
                  <td>{{ r.usuario ?? '–' }}<br /><small class="muted">{{ nombreRol(r.rol) }}</small></td>
                  <td>{{ nombreAccion(r.accion) }}</td>
                  <td>{{ r.recurso ?? '–' }}{{ r.recursoId ? ' #' + r.recursoId : '' }}</td>
                  <td>{{ r.paciente ?? '–' }}</td>
                  <td><app-chip [estado]="r.resultado" /></td>
                  <td class="nowrap">{{ r.ip ?? '–' }}</td>
                  <td>{{ r.detalle ?? '' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <mat-paginator [length]="lista().total" [pageSize]="lista().tamano" [pageIndex]="lista().pagina - 1" [hidePageSize]="true" (page)="pagina($event)" />
      </app-estado>
    </app-pagina>
  `,
  styles: `
    .filtros { display: flex; flex-wrap: wrap; gap: .25rem 1rem; align-items: flex-start; margin-bottom: 1rem; } .filtros mat-form-field { flex: 1 1 200px; min-width: 0; } .paciente { flex: 1 1 100%; } .filtros .acciones-fila { flex: 1 1 100%; }
    .filtro-paciente { display: inline-flex; align-items: center; gap: .4rem; } .nowrap { white-space: nowrap; }
  `,
})
export class AuditoriaAdmin {
  private readonly api = inject(Api);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly acciones = ACCIONES;
  protected readonly nombreAccion = (a: string) => NOMBRE_ACCION.get(a) ?? a;
  protected readonly hora = (v: string) => fechaHora(v);
  protected readonly nombreRol = (r: string | null) => (r ? (ETIQUETA_ROL[r as Rol] ?? r) : '');
  protected readonly f = this.fb.group({ accion: [''], resultado: [''], desde: [''], hasta: [''] });
  protected readonly paciente = signal<{ id: number; nombre: string } | null>(null);
  protected readonly lista = signal<PaginaDe<any>>({ items: [], total: 0, pagina: 1, tamano: 50 });
  protected readonly cargando = signal(true);
  protected readonly descargando = signal(false);
  protected readonly error = signal<string | null>(null);
  private n = 1;

  constructor() {
    this.cargar();
  }

  private filtros(): Record<string, unknown> {
    const v = this.f.getRawValue();
    return { accion: v.accion, resultado: v.resultado, desde: v.desde, hasta: v.hasta, paciente: this.paciente()?.id };
  }

  protected aplicar(): void {
    this.n = 1;
    this.cargar();
  }

  protected limpiar(): void {
    this.f.reset();
    this.paciente.set(null);
    this.aplicar();
  }

  protected elegirPaciente(p: PacienteBuscado): void {
    this.paciente.set({ id: p.id, nombre: p.nombre });
    this.aplicar();
  }

  protected quitarPaciente(): void {
    this.paciente.set(null);
    this.aplicar();
  }

  protected pagina(e: PageEvent): void {
    this.n = e.pageIndex + 1;
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<PaginaDe<any>>('/auditoria', { ...this.filtros(), pagina: this.n, tamano: 50 }).subscribe({
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

  protected descargar(): void {
    this.descargando.set(true);
    const consulta = aParametros(this.filtros()).toString();
    this.api.descargar(`/auditoria/exportar${consulta ? '?' + consulta : ''}`).subscribe({
      next: (b) => {
        this.descargando.set(false);
        guardarArchivo(b, 'auditoria.csv');
      },
      error: (e: unknown) => {
        this.descargando.set(false);
        this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
      },
    });
  }
}
