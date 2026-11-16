import { Component, inject, isDevMode, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { normalizarRut } from '../core/rut';
import { Logo } from '../shared/logo';
import { RutFormato } from '../shared/piezas';

/** Validador del RUT. Acepta el campo vacío (lo cubre `required`) y rechaza un dígito verificador incorrecto. */
const rutValido: ValidatorFn = (control) => {
  const valor = String(control.value ?? '');
  return !valor || normalizarRut(valor) ? null : { rut: true };
};

/**
 * Pantalla de inicio de sesión. Pide RUT y contraseña, valida el RUT antes de enviarlo y lleva al usuario a su área. Si la
 * persona tiene más de un rol, la lleva a elegir perfil. Ofrece también la Clave Única simulada (si está activada) y el
 * enlace para activar la cuenta con un código.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatExpansionModule, MatListModule, RouterLink, Logo, RutFormato],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Api);

  protected readonly form = this.fb.group({
    rut: ['', [Validators.required, rutValido]],
    password: ['', [Validators.required]],
  });

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly verClave = signal(false);
  /** La Clave Única simulada está activada en la configuración del centro. */
  protected readonly claveUnica = signal(false);

  /** Solo en desarrollo (`ng serve`): atajos para la demostración. */
  protected readonly mostrarDemo = isDevMode();
  protected readonly cuentasDemo = [
    { nombre: 'Camila Rojas', detalle: 'Administración', rut: '11.222.333-9' },
    { nombre: 'Daniela Pizarro', detalle: 'Recepción y paciente (dos perfiles)', rut: '12.333.444-2' },
    { nombre: 'Dr. Rodrigo Salas', detalle: 'Médico de Medicina General', rut: '12.345.678-5' },
    { nombre: 'Dra. Paula Contreras', detalle: 'Médica de Kinesiología', rut: '14.567.890-0' },
    { nombre: 'Ana Muñoz', detalle: 'Paciente del Dr. Salas', rut: '16.789.012-1' },
    { nombre: 'Carlos Pérez', detalle: 'Paciente de ambos médicos', rut: '18.234.567-9' },
    { nombre: 'Sofía Araya', detalle: 'Paciente de la Dra. Contreras', rut: '19.345.678-2' },
  ];

  constructor() {
    this.api.get<{ claveUnicaSimulada: boolean }>('/configuracion/publica').subscribe({ next: (c) => this.claveUnica.set(c.claveUnicaSimulada), error: () => undefined });
  }

  protected usarCuenta(rut: string): void {
    this.form.patchValue({ rut, password: 'Vida2026' });
    this.error.set(null);
  }

  /** Envía las credenciales. Al ingresar reemplaza `/login` en el historial, para que Atrás no regrese aquí. */
  protected ingresar(simulada = false): void {
    if (this.cargando()) return;
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { rut, password } = this.form.getRawValue();
    this.cargando.set(true);
    this.auth.login(rut, password, simulada).subscribe({
      next: (r) => void this.router.navigateByUrl(this.auth.rutaInicio(r.usuario.rol), { replaceUrl: true }),
      error: (err: unknown) => {
        this.error.set(mensajeError(err));
        this.cargando.set(false);
      },
    });
  }
}
