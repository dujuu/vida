import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { normalizarRut } from '../core/rut';
import { Logo } from '../shared/logo';
import { RutFormato } from '../shared/piezas';

const rutValido: ValidatorFn = (c) => (!c.value || normalizarRut(String(c.value)) ? null : { rut: true });
const coinciden: ValidatorFn = (g) => (g.get('password')?.value === g.get('repetir')?.value ? null : { distintas: true });

/**
 * Activación de una cuenta (o recuperación de acceso) con el código de un solo uso que entregan en recepción o
 * administración. La persona elige su propia contraseña: nadie más la conoce. El paciente acepta el consentimiento sobre
 * el uso de sus datos de salud la primera vez.
 */
@Component({
  selector: 'app-activar',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatCheckboxModule, RouterLink, Logo, RutFormato],
  template: `
    <main class="pagina">
      <section class="acceso" aria-labelledby="t">
        <app-logo class="logo" />
        <h1 id="t">Active su cuenta</h1>
        <p class="muted">Escriba su RUT y el código que le entregaron, y elija su contraseña.</p>
        <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
          <mat-form-field>
            <mat-label>RUT</mat-label>
            <input matInput formControlName="rut" appRut placeholder="12.345.678-5" autocomplete="username" />
            <mat-error>Ingrese un RUT válido.</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Código de activación</mat-label>
            <input matInput formControlName="codigo" placeholder="ABCD-EFGH" autocomplete="one-time-code" maxlength="9" style="text-transform: uppercase" />
            <mat-error>Ingrese el código.</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Contraseña nueva</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="new-password" />
            <mat-hint>Mínimo 8 caracteres, con letras y números</mat-hint>
            <mat-error>Debe tener al menos 8 caracteres.</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Repita la contraseña</mat-label>
            <input matInput type="password" formControlName="repetir" autocomplete="new-password" />
          </mat-form-field>
          @if (form.hasError('distintas') && form.controls.repetir.touched) { <p class="aviso aviso-error" role="alert">Las contraseñas no coinciden.</p> }
          <div class="consentimiento">
            <mat-checkbox formControlName="acepta">Acepto el tratamiento de mis datos personales y de salud por el Centro Médico Vida Norte para mi atención y seguimiento (si es paciente).</mat-checkbox>
          </div>
          @if (error(); as e) { <p class="aviso aviso-error" role="alert"><mat-icon>error</mat-icon><span>{{ e }}</span></p> }
          <button mat-flat-button type="submit" class="entrar" [disabled]="cargando()">{{ cargando() ? 'Activando…' : 'Activar y entrar' }}</button>
        </form>
        <p class="activar"><a routerLink="/login">Volver al inicio de sesión</a></p>
      </section>
    </main>
  `,
  styleUrl: './login.css',
})
export class Activar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      rut: ['', [Validators.required, rutValido]],
      codigo: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(8)]],
      repetir: ['', Validators.required],
      acepta: [false],
    },
    { validators: coinciden },
  );

  protected enviar(): void {
    if (this.cargando()) return;
    if (this.form.invalid) return this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    this.cargando.set(true);
    this.error.set(null);
    this.auth.activar({ rut: v.rut, codigo: v.codigo, password: v.password, aceptaConsentimiento: v.acepta }).subscribe({
      next: (r) => void this.router.navigateByUrl(this.auth.rutaInicio(r.usuario.rol), { replaceUrl: true }),
      error: (e: unknown) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}
