import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { RequestConUsuario } from '../auth/usuario-autenticado.js';

/** Código legible de cada estado HTTP, para que el frontend no dependa del texto del mensaje. */
export function codigoDeEstado(estado: number): string {
  const codigos: Record<number, string> = {
    400: 'SOLICITUD_INVALIDA',
    401: 'NO_AUTENTICADO',
    403: 'SIN_PERMISO',
    404: 'NO_ENCONTRADO',
    409: 'CONFLICTO',
    413: 'ARCHIVO_MUY_GRANDE',
    429: 'DEMASIADOS_INTENTOS',
  };
  return codigos[estado] ?? (estado >= 500 ? 'ERROR_INTERNO' : 'ERROR');
}

/**
 * Filtro global de excepciones. Entrega siempre el mismo formato `{ statusCode, codigo, message, ...datos }`, no filtra
 * detalles internos en los errores 500 y deja en auditoría cada acceso denegado (403) o a un recurso ajeno (404)
 * de un usuario con sesión.
 */
@Catch()
export class FiltroExcepciones implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  constructor(private readonly auditoria: AuditoriaService) {}

  async catch(excepcion: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<RequestConUsuario>();

    let estado = 500;
    let cuerpo: Record<string, unknown> = { message: 'Error interno del servidor' };

    if (excepcion instanceof HttpException) {
      estado = excepcion.getStatus();
      const r = excepcion.getResponse();
      cuerpo = typeof r === 'string' ? { message: r } : { ...(r as Record<string, unknown>) };
    } else {
      // Errores del analizador de cuerpos de Express (JSON inválido, cuerpo demasiado grande).
      const e = excepcion as { status?: number; statusCode?: number; type?: string };
      const st = e?.status ?? e?.statusCode;
      if (typeof st === 'number' && st >= 400 && st < 500) {
        estado = st;
        cuerpo = { message: e.type === 'entity.too.large' ? 'La solicitud es demasiado grande' : 'La solicitud no es válida' };
      } else {
        this.log.error(excepcion instanceof Error ? (excepcion.stack ?? excepcion.message) : String(excepcion));
      }
    }
    cuerpo.statusCode = estado;
    cuerpo.codigo = (cuerpo.codigo as string | undefined) ?? codigoDeEstado(estado);

    if (req.user && (estado === 403 || estado === 404) && req.route) {
      try {
        await this.auditoria.registrar(req.user, Accion.ACCESO_DENEGADO, {
          recurso: 'ruta',
          resultado: 'DENEGADO',
          detalle: `${req.method} ${req.route.path} -> ${estado}`,
        });
      } catch (e) {
        this.log.error(`No se pudo auditar un acceso denegado: ${(e as Error).message}`);
      }
    }
    res.status(estado).json(cuerpo);
  }
}
