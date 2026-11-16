import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { AuthService } from '../core/auth.service';

/** Resumen liviano que entrega el servidor. */
export interface ResumenAvisos {
  sinLeer: number;
  tomasPorVencer: number;
  tomasAtrasadas: number;
}

/** Cada cuántos segundos se consulta el resumen mientras la aplicación está abierta. */
const INTERVALO_MS = 30_000;

/**
 * Consulta periódica (y al volver a la pestaña) de los avisos del usuario. Es la única consulta que se repite sola:
 * las pantallas leen `cambios` y recargan sus datos solo cuando el resumen cambió.
 *
 * Con la pestaña cerrada no hay avisos: un navegador sin HTTPS no permite notificaciones del sistema. Por eso las tomas
 * por vencer y atrasadas se destacan dentro de la aplicación y con una alerta mientras está abierta.
 */
@Injectable({ providedIn: 'root' })
export class AvisosStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  /** Último resumen recibido. */
  readonly resumen = signal<ResumenAvisos>({ sinLeer: 0, tomasPorVencer: 0, tomasAtrasadas: 0 });
  /** Contador que sube cada vez que el resumen cambia; las pantallas lo observan para recargarse. */
  readonly cambios = signal(0);

  private temporizador: ReturnType<typeof setInterval> | null = null;
  private primera = true;
  private readonly alVolver = () => {
    if (document.visibilityState === 'visible') void this.cargar();
  };

  /** Empieza a consultar. Es seguro llamarlo más de una vez. */
  iniciar(destruir: DestroyRef): void {
    if (this.temporizador) return;
    this.primera = true;
    void this.cargar();
    this.temporizador = setInterval(() => void this.cargar(), INTERVALO_MS);
    document.addEventListener('visibilitychange', this.alVolver);
    destruir.onDestroy(() => this.detener());
  }

  /** Deja de consultar (al cerrar la sesión). */
  detener(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    document.removeEventListener('visibilitychange', this.alVolver);
    document.title = 'Vida Norte, seguimiento de tratamientos';
  }

  /** Consulta el resumen ahora. */
  async cargar(): Promise<void> {
    if (!this.auth.usuario()?.rol) return;
    try {
      const nuevo = await firstValueFrom(this.api.get<ResumenAvisos>('/notificaciones/resumen'));
      const antes = this.resumen();
      const cambio = nuevo.sinLeer !== antes.sinLeer || nuevo.tomasPorVencer !== antes.tomasPorVencer || nuevo.tomasAtrasadas !== antes.tomasAtrasadas;
      this.resumen.set(nuevo);
      if (cambio) this.cambios.update((n) => n + 1);
      document.title = `${nuevo.sinLeer > 0 ? `(${nuevo.sinLeer}) ` : ''}Vida Norte, seguimiento de tratamientos`;
      const aumentaron = nuevo.tomasPorVencer > antes.tomasPorVencer || nuevo.tomasAtrasadas > antes.tomasAtrasadas;
      if (!this.primera && aumentaron && this.auth.usuario()?.rol === 'PACIENTE') {
        this.snack
          .open(nuevo.tomasAtrasadas > 0 ? 'Tiene una toma atrasada' : 'Tiene una toma por vencer', 'Ver', { duration: 12_000 })
          .onAction()
          .subscribe(() => void this.router.navigateByUrl('/paciente/hoy'));
      }
      this.primera = false;
    } catch {
      // Sin conexión: se reintenta en el próximo ciclo.
    }
  }
}
