import { HttpException, HttpStatus, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Limita las peticiones por IP en una ventana de un minuto. Es una defensa general contra el abuso; el bloqueo
 * por intentos de inicio de sesión es aparte (por RUT y por IP, en la base de datos).
 *
 * El máximo por minuto se puede cambiar con la variable `LIMITE_PETICIONES` (por defecto 600).
 */
@Injectable()
export class LimitadorMiddleware implements NestMiddleware {
  private readonly ventana = new Map<string, { inicio: number; cuenta: number }>();
  private ultimaLimpieza = Date.now();

  use(req: Request, _res: Response, next: NextFunction): void {
    const ahora = Date.now();
    const maximo = Number(process.env.LIMITE_PETICIONES ?? 600);
    if (ahora - this.ultimaLimpieza > 60_000) {
      for (const [ip, v] of this.ventana) if (ahora - v.inicio > 60_000) this.ventana.delete(ip);
      this.ultimaLimpieza = ahora;
    }
    const ip = req.ip ?? 'desconocida';
    const v = this.ventana.get(ip);
    if (!v || ahora - v.inicio > 60_000) {
      this.ventana.set(ip, { inicio: ahora, cuenta: 1 });
    } else if (++v.cuenta > maximo) {
      throw new HttpException('Demasiadas solicitudes. Espere un momento.', HttpStatus.TOO_MANY_REQUESTS);
    }
    next();
  }
}
