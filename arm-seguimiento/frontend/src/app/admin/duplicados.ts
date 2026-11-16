import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { fechaCorta } from '../core/fechas';
import { Estado, Pagina } from '../shared/piezas';

interface Ficha {
  id: number;
  rut: string;
  nombre: string;
}

interface Par {
  fechaNacimiento: string;
  a: Ficha;
  b: Ficha;
}

interface DatosFusion {
  conservar: Ficha;
  fusionar: Ficha;
}

/** Confirmación de la fusión: no tiene deshacer, así que exige escribir el RUT del registro que desaparece y un motivo. */
@Component({
  selector: 'app-confirmar-fusion',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Fusionar fichas</h2>
    <mat-dialog-content class="contenido">
      <p>Se conserva <strong>{{ datos.conservar.nombre }}</strong> (RUT {{ datos.conservar.rut }}). Todo lo del registro de <strong>{{ datos.fusionar.nombre }}</strong> (RUT {{ datos.fusionar.rut }}) pasa a la ficha que se conserva, y ese registro queda desactivado.</p>
      <p class="aviso aviso-error"><strong>No tiene deshacer.</strong> Revise que sean la misma persona.</p>
      <mat-form-field><mat-label>Escriba el RUT del registro que se fusiona</mat-label><input matInput [(ngModel)]="rut" autocomplete="off" /></mat-form-field>
      <mat-form-field><mat-label>Motivo</mat-label><input matInput [(ngModel)]="motivo" maxlength="200" /></mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="null">Cancelar</button>
      <button mat-flat-button type="button" [disabled]="!valido()" [mat-dialog-close]="{ rutConfirmacion: rut.trim(), motivo: motivo.trim() }">Fusionar</button>
    </mat-dialog-actions>
  `,
  styles: `.contenido { display: grid; gap: .5rem; min-width: min(420px, 80vw); }`,
})
export class ConfirmarFusion {
  protected readonly datos = inject<DatosFusion>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ConfirmarFusion>);
  protected rut = '';
  protected motivo = '';
  protected valido(): boolean {
    const limpio = (v: string) => v.replace(/[.\-\s]/g, '').toUpperCase();
    return limpio(this.rut) === limpio(this.datos.fusionar.rut) && this.motivo.trim().length >= 3;
  }
}

/**
 * Posibles fichas duplicadas de un mismo paciente (mismo nombre y fecha de nacimiento). El administrador elige cuál conservar y
 * la otra se fusiona con ella. Es una acción sin deshacer, por eso exige escribir el RUT y un motivo.
 */
@Component({
  selector: 'app-duplicados-admin',
  imports: [Pagina, Estado, MatButtonModule, MatIconModule],
  template: `
    <app-pagina titulo="Pacientes duplicados" subtitulo="Mismo nombre y fecha de nacimiento con RUT distinto" [volver]="true">
      <app-estado [cargando]="cargando()" [error]="error()" [vacio]="pares().length === 0" mensaje="No se detectaron posibles duplicados." icono="verified" (reintento)="cargar()">
        <ul class="lista-tarjetas">
          @for (p of pares(); track p.a.id + '-' + p.b.id) {
            <li class="tarjeta par">
              <p class="muted">Nacimiento: {{ fecha(p.fechaNacimiento) }}</p>
              <div class="fichas">
                <div class="ficha"><strong>{{ p.a.nombre }}</strong><small>RUT {{ p.a.rut }}</small><button mat-stroked-button type="button" (click)="fusionar(p.a, p.b)">Conservar esta</button></div>
                <mat-icon aria-hidden="true">compare_arrows</mat-icon>
                <div class="ficha"><strong>{{ p.b.nombre }}</strong><small>RUT {{ p.b.rut }}</small><button mat-stroked-button type="button" (click)="fusionar(p.b, p.a)">Conservar esta</button></div>
              </div>
            </li>
          }
        </ul>
      </app-estado>
    </app-pagina>
  `,
  styles: `.par { display: grid; gap: .5rem; } .fichas { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; } .ficha { display: grid; gap: .25rem; flex: 1; min-width: 14rem; } small { color: var(--mat-sys-on-surface-variant); }`,
})
export class DuplicadosAdmin {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly pares = signal<Par[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly fecha = (f: string) => fechaCorta(f.slice(0, 10));

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.get<Par[]>('/pacientes/duplicados').subscribe({
      next: (r) => {
        this.pares.set(r);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected async fusionar(conservar: Ficha, fusionar: Ficha): Promise<void> {
    const r = await firstValueFrom(
      this.dialog.open<ConfirmarFusion, DatosFusion, { rutConfirmacion: string; motivo: string } | null>(ConfirmarFusion, { data: { conservar, fusionar }, width: '480px', maxWidth: '95vw' }).afterClosed(),
    );
    if (!r) return;
    this.api.post('/pacientes/fusionar', { conservadoId: conservar.id, fusionadoId: fusionar.id, ...r }).subscribe({
      next: () => {
        this.snack.open('Fichas fusionadas', 'Cerrar', { duration: 5000 });
        this.cargar();
      },
      error: (e: unknown) => this.snack.open(mensajeError(e), 'Cerrar', { duration: 10000 }),
    });
  }
}
