import { Component, Directive, inject, input, output } from '@angular/core';
import { NgControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { formatearRutEntrada, limpiarRut } from '../core/rut';

/** Encabezado de una pantalla: título, subtítulo opcional, botón para volver y acciones a la derecha. */
@Component({
  selector: 'app-pagina',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <header class="cabecera">
      @if (volver()) {
        <button mat-icon-button type="button" (click)="atras()" aria-label="Volver"><mat-icon>arrow_back</mat-icon></button>
      }
      <div class="textos">
        <h1>{{ titulo() }}</h1>
        @if (subtitulo()) { <p class="sub">{{ subtitulo() }}</p> }
      </div>
      <div class="acciones"><ng-content select="[acciones]" /></div>
    </header>
    <ng-content />
  `,
  styles: `
    :host { display: block; }
    .cabecera { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .textos { flex: 1; min-width: 12rem; }
    .sub { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-medium); }
    .acciones { display: flex; gap: .5rem; flex-wrap: wrap; }
  `,
})
export class Pagina {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>('');
  readonly volver = input<boolean>(false);
  private readonly ubicacion = inject(Location);
  protected atras(): void {
    this.ubicacion.back();
  }
}

/** Estado de una carga: muestra «cargando», el error con un botón para reintentar, o el mensaje de vacío. */
@Component({
  selector: 'app-estado',
  imports: [MatProgressBarModule, MatIconModule, MatButtonModule],
  template: `
    @if (cargando()) {
      <mat-progress-bar mode="indeterminate" aria-label="Cargando" />
    } @else if (error()) {
      <p class="aviso aviso-error" role="alert"><mat-icon>error</mat-icon><span>{{ error() }}</span>
        @if (reintentable()) { <button mat-button type="button" (click)="reintento.emit()">Reintentar</button> }
      </p>
    } @else if (vacio()) {
      <div class="vacio"><mat-icon>{{ icono() }}</mat-icon><p>{{ mensaje() }}</p><ng-content select="[vacio]" /></div>
    } @else {
      <ng-content />
    }
  `,
  styles: `
    .vacio { display: grid; justify-items: center; gap: .5rem; padding: 2.5rem 1rem; color: var(--mat-sys-on-surface-variant); text-align: center; }
    .vacio mat-icon { font-size: 2.5rem; width: 2.5rem; height: 2.5rem; opacity: .6; }
  `,
})
export class Estado {
  readonly cargando = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly vacio = input<boolean>(false);
  readonly mensaje = input<string>('No hay nada para mostrar.');
  readonly icono = input<string>('inbox');
  readonly reintentable = input<boolean>(true);
  readonly reintento = output<void>();
}

/** Da formato de RUT mientras se escribe, en cualquier campo de formulario reactivo. */
@Directive({ selector: 'input[appRut]', host: { '(input)': 'alEscribir($event)', inputmode: 'text', autocomplete: 'off' } })
export class RutFormato {
  private readonly control = inject(NgControl, { self: true, optional: true });

  protected alEscribir(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const cursor = input.selectionStart ?? input.value.length;
    const significativosAntes = limpiarRut(input.value.slice(0, cursor)).length;
    const formateado = formatearRutEntrada(input.value);
    if (formateado === input.value) return;
    this.control?.control?.setValue(formateado);
    let posicion = 0;
    let vistos = 0;
    while (posicion < formateado.length && vistos < significativosAntes) {
      if (/[0-9K]/.test(formateado[posicion])) vistos++;
      posicion++;
    }
    input.setSelectionRange(posicion, posicion);
  }
}

/** Datos del diálogo de confirmación. */
export interface OpcionesConfirmar {
  titulo: string;
  texto?: string;
  /** Si se indica, pide un motivo (obligatorio) con esta etiqueta. */
  motivo?: string;
  confirmar?: string;
  /** Si se indica, la persona debe escribir este texto para confirmar (acciones sin deshacer). */
  escribir?: string;
  peligro?: boolean;
}

/** Resultado del diálogo de confirmación. */
export interface RespuestaConfirmar {
  motivo: string;
}

/** Diálogo para confirmar una acción, con motivo opcional u obligatorio. */
@Component({
  selector: 'app-confirmar',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ datos.titulo }}</h2>
    <mat-dialog-content class="contenido">
      @if (datos.texto) { <p>{{ datos.texto }}</p> }
      @if (datos.motivo) {
        <mat-form-field>
          <mat-label>{{ datos.motivo }}</mat-label>
          <textarea matInput rows="2" [(ngModel)]="motivo" maxlength="200"></textarea>
        </mat-form-field>
      }
      @if (datos.escribir) {
        <mat-form-field>
          <mat-label>Escriba «{{ datos.escribir }}» para confirmar</mat-label>
          <input matInput [(ngModel)]="escrito" autocomplete="off" />
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="null">Cancelar</button>
      <button mat-flat-button type="button" [disabled]="!valido()" [mat-dialog-close]="{ motivo: motivo.trim() }" [class.peligro]="datos.peligro">{{ datos.confirmar ?? 'Confirmar' }}</button>
    </mat-dialog-actions>
  `,
  styles: `.contenido { display: grid; gap: .75rem; min-width: min(380px, 80vw); } .peligro { --mat-button-filled-container-color: var(--mat-sys-error); --mat-button-filled-label-text-color: var(--mat-sys-on-error); }`,
})
export class Confirmar {
  protected readonly datos = inject<OpcionesConfirmar>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<Confirmar>);
  protected motivo = '';
  protected escrito = '';
  protected valido(): boolean {
    return (!this.datos.motivo || this.motivo.trim().length >= 3) && (!this.datos.escribir || this.escrito.trim() === this.datos.escribir);
  }
}

/** Abre el diálogo de confirmación y devuelve la respuesta, o `null` si se canceló. */
export async function confirmar(dialog: MatDialog, opciones: OpcionesConfirmar): Promise<RespuestaConfirmar | null> {
  return (await firstValueFrom(dialog.open<Confirmar, OpcionesConfirmar, RespuestaConfirmar | null>(Confirmar, { data: opciones, width: '440px', maxWidth: '95vw' }).afterClosed())) ?? null;
}

/** Guarda un archivo descargado con el nombre indicado. */
export function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
