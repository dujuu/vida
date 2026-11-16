import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatInputModule } from '@angular/material/input';
import { Api } from '../core/api';
import { mensajeError } from '../core/errores';
import { AuthService } from '../core/auth.service';

/** Diálogo para cambiar la contraseña propia. Al cambiarla, el servidor cierra las demás sesiones. */
@Component({
  selector: 'app-cambiar-password',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Cambiar contraseña</h2>
    <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
      <mat-dialog-content class="campos">
        <mat-form-field>
          <mat-label>Contraseña actual</mat-label>
          <input matInput type="password" formControlName="actual" autocomplete="current-password" />
          <mat-error>Ingrese su contraseña actual.</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Contraseña nueva</mat-label>
          <input matInput type="password" formControlName="nueva" autocomplete="new-password" />
          <mat-hint>Mínimo 8 caracteres, con letras y números</mat-hint>
          <mat-error>La contraseña nueva debe tener al menos 8 caracteres.</mat-error>
        </mat-form-field>
        @if (error()) { <p class="aviso aviso-error" role="alert">{{ error() }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="enviando()">Cambiar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `.campos { display: flex; flex-direction: column; gap: 1rem; padding-top: .5rem !important; }`,
})
export class CambiarPassword {
  private readonly api = inject(Api);
  private readonly ref = inject(MatDialogRef<CambiarPassword>);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  protected readonly form = inject(NonNullableFormBuilder).group({
    actual: ['', Validators.required],
    nueva: ['', [Validators.required, Validators.minLength(8)]],
  });
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected guardar(): void {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.enviando.set(true);
    this.error.set(null);
    this.api.post('/auth/password', this.form.getRawValue()).subscribe({
      next: () => {
        this.auth.contrasenaCambiada();
        this.snack.open('Contraseña cambiada. Las demás sesiones se cerraron.', 'Cerrar');
        this.ref.close();
      },
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.enviando.set(false);
      },
    });
  }
}
