import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaCorta, fechaHora } from '../core/fechas';
import { Estado, Pagina } from '../shared/piezas';

/** Menú «Más»: accesos a la ficha, el perfil, los médicos y los avisos. */
@Component({
  selector: 'app-mas',
  imports: [Pagina, MatIconModule, RouterLink],
  template: `
    <app-pagina titulo="Más">
      <ul class="lista-tarjetas">
        @for (e of entradas; track e.ruta) {
          <li><a class="item" [routerLink]="e.ruta"><mat-icon>{{ e.icono }}</mat-icon><span class="grande"><strong>{{ e.titulo }}</strong><small>{{ e.texto }}</small></span><mat-icon>chevron_right</mat-icon></a></li>
        }
      </ul>
    </app-pagina>
  `,
  styles: `a.item { text-decoration: none; color: inherit; min-height: 64px; }`,
})
export class Mas {
  protected readonly entradas = [
    { ruta: '../ficha', icono: 'folder_shared', titulo: 'Mi ficha', texto: 'Atenciones, antecedentes, exámenes y documentos' },
    { ruta: '../medicos', icono: 'stethoscope', titulo: 'Mis médicos', texto: 'Los profesionales que lo atienden' },
    { ruta: '../perfil', icono: 'manage_accounts', titulo: 'Mi perfil', texto: 'Contacto, emergencia y preferencias' },
    { ruta: '../notificaciones', icono: 'notifications', titulo: 'Avisos', texto: 'Notificaciones y preferencias de aviso' },
  ];
}

/** Datos administrativos del paciente. */
interface Perfil {
  rut: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  fechaNacimiento: string | null;
  direccion: string | null;
  comuna: string | null;
  emergenciaNombre: string | null;
  emergenciaTelefono: string | null;
  emergenciaParentesco: string | null;
  medioContacto: string | null;
  aceptaRecordatorios: boolean;
  consentimiento: { version: number; aceptadoEn: string } | null;
}

/** «Mi perfil»: el paciente edita su contacto y preferencias. No puede cambiar su RUT, nombre ni fecha de nacimiento. */
@Component({
  selector: 'app-perfil',
  imports: [Pagina, Estado, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatButtonModule],
  template: `
    <app-pagina titulo="Mi perfil" [volver]="true">
      <app-estado [cargando]="cargando()" [error]="error()">
        @if (p(); as x) {
          <section class="tarjeta"><h2>{{ x.nombre }}</h2><p class="muted">RUT {{ x.rut }}{{ x.fechaNacimiento ? ' · Nacimiento: ' + fecha(x.fechaNacimiento) : '' }}</p>
            <p class="muted">Para cambiar su nombre, RUT o fecha de nacimiento, hágalo en recepción.</p>
            @if (x.consentimiento) { <p class="muted">Consentimiento aceptado el {{ hora(x.consentimiento.aceptadoEn) }} (versión {{ x.consentimiento.version }}).</p> }
          </section>
          <form [formGroup]="form" (ngSubmit)="guardar()" class="tarjeta columna" novalidate>
            <h2>Contacto</h2>
            <div class="campos">
              <mat-form-field><mat-label>Teléfono</mat-label><input matInput formControlName="telefono" autocomplete="tel" /></mat-form-field>
              <mat-form-field><mat-label>Correo</mat-label><input matInput formControlName="correo" type="email" autocomplete="email" /></mat-form-field>
              <mat-form-field><mat-label>Dirección</mat-label><input matInput formControlName="direccion" autocomplete="street-address" /></mat-form-field>
              <mat-form-field><mat-label>Comuna</mat-label><input matInput formControlName="comuna" /></mat-form-field>
            </div>
            <h2>Contacto de emergencia</h2>
            <div class="campos">
              <mat-form-field><mat-label>Nombre</mat-label><input matInput formControlName="emergenciaNombre" /></mat-form-field>
              <mat-form-field><mat-label>Teléfono</mat-label><input matInput formControlName="emergenciaTelefono" /></mat-form-field>
              <mat-form-field><mat-label>Parentesco</mat-label><input matInput formControlName="emergenciaParentesco" /></mat-form-field>
            </div>
            <h2>Preferencias</h2>
            <mat-form-field><mat-label>¿Cómo prefiere que lo contacten?</mat-label>
              <mat-select formControlName="medioContacto"><mat-option [value]="''">Sin preferencia</mat-option><mat-option value="LLAMADA">Llamada</mat-option><mat-option value="WHATSAPP">WhatsApp</mat-option><mat-option value="CORREO">Correo</mat-option></mat-select>
            </mat-form-field>
            <mat-slide-toggle formControlName="aceptaRecordatorios">Acepto recibir recordatorios del centro</mat-slide-toggle>
            @if (errorGuardar()) { <p class="aviso aviso-error" role="alert">{{ errorGuardar() }}</p> }
            <div><button mat-flat-button class="boton-grande" type="submit" [disabled]="guardando()">Guardar cambios</button></div>
          </form>
        }
      </app-estado>
    </app-pagina>
  `,
})
export class PerfilPaciente {
  private readonly api = inject(Api);
  private readonly snack = inject(MatSnackBar);
  protected readonly p = signal<Perfil | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly errorGuardar = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly fecha = fechaCorta;
  protected readonly hora = fechaHora;
  protected readonly form = inject(NonNullableFormBuilder).group({
    telefono: [''], correo: [''], direccion: [''], comuna: [''], emergenciaNombre: [''], emergenciaTelefono: [''], emergenciaParentesco: [''], medioContacto: [''], aceptaRecordatorios: [true],
  });

  constructor() {
    this.api.get<Perfil>('/mi-perfil').subscribe({
      next: (r) => {
        this.p.set(r);
        this.form.patchValue({ ...r, telefono: r.telefono ?? '', correo: r.correo ?? '', direccion: r.direccion ?? '', comuna: r.comuna ?? '', emergenciaNombre: r.emergenciaNombre ?? '', emergenciaTelefono: r.emergenciaTelefono ?? '', emergenciaParentesco: r.emergenciaParentesco ?? '', medioContacto: r.medioContacto ?? '' });
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected guardar(): void {
    this.guardando.set(true);
    this.errorGuardar.set(null);
    const v = this.form.getRawValue();
    const cuerpo: Record<string, unknown> = { ...v };
    if (!v.medioContacto) delete cuerpo['medioContacto'];
    this.api.patch<Perfil>('/mi-perfil', cuerpo).subscribe({
      next: (r) => {
        this.p.set(r);
        this.guardando.set(false);
        this.snack.open('Cambios guardados', 'Cerrar');
      },
      error: (e: unknown) => {
        this.errorGuardar.set(mensajeError(e));
        this.guardando.set(false);
      },
    });
  }
}

/** «Mis médicos»: los profesionales con los que el paciente tiene o tuvo relación de atención. */
@Component({
  selector: 'app-mis-medicos',
  imports: [Pagina, Estado, MatIconModule],
  template: `
    <app-pagina titulo="Mis médicos" [volver]="true">
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="lista().length === 0" mensaje="Todavía no tiene médicos asignados. Se asignan al reservar su primera hora.">
        <ul class="lista-tarjetas">
          @for (m of lista(); track m.id) {
            <li class="item"><mat-icon>person</mat-icon><span class="grande"><strong>{{ m.nombre }}</strong><small>{{ m.especialidad }} · {{ m.vigente ? 'Lo atiende actualmente' : 'Relación finalizada' }}</small></span></li>
          }
        </ul>
      </app-estado>
    </app-pagina>
  `,
})
export class MisMedicos {
  private readonly api = inject(Api);
  protected readonly lista = signal<Array<{ id: number; nombre: string; especialidad: string | null; vigente: boolean }>>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.get<Array<{ id: number; nombre: string; especialidad: string | null; vigente: boolean }>>('/mis-medicos').subscribe({
      next: (r) => {
        this.lista.set(r);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}
