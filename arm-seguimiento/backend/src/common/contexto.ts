import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Datos de la petición en curso que la auditoría necesita sin que cada método los reciba por parámetro. */
export interface ContextoPeticion {
  ip: string | null;
  agente: string | null;
}

/** Almacén por petición (sigue la ejecución asíncrona de cada solicitud). */
export const almacenContexto = new AsyncLocalStorage<ContextoPeticion>();

/** Devuelve el contexto de la petición actual, o valores vacíos si se llama fuera de una petición. */
export function contextoActual(): ContextoPeticion {
  return almacenContexto.getStore() ?? { ip: null, agente: null };
}

/** Guarda la IP y el navegador de cada petición en el contexto. */
@Injectable()
export class ContextoMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const agente = req.headers['user-agent'];
    almacenContexto.run({ ip: req.ip ?? null, agente: typeof agente === 'string' ? agente.slice(0, 200) : null }, next);
  }
}
