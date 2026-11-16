import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Rol } from '../usuarios/rol.enum.js';
import { IS_PUBLIC_KEY } from './decorators.js';
import type { JwtPayload, RequestConUsuario } from './usuario-autenticado.js';

/**
 * Guardia global de autenticación: exige un token válido en todas las rutas salvo las marcadas con `@Public()`.
 *
 * No confía en el token: en cada petición verifica en la base de datos que la sesión siga vigente (no revocada ni
 * vencida), que el usuario esté activo y que conserve el rol con que actúa. Por eso desactivar una cuenta, quitarle
 * un rol o cerrar una sesión tiene efecto inmediato.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (esPublica) return true;

    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const [tipo, token] = request.headers.authorization?.split(' ') ?? [];
    if (tipo?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    if (typeof payload.sid !== 'string' || typeof payload.sub !== 'number') {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    const [fila] = await this.ds.query(
      `SELECT s.id AS sesionId, s.usuario_id AS usuarioId, s.revocada_en AS revocadaEn, s.expira_en AS expiraEn,
              u.activo, u.titulo, u.nombres, u.apellido_paterno AS apellidoPaterno, u.apellido_materno AS apellidoMaterno
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ?`,
      [payload.sid],
    );
    if (!fila || fila.usuarioId !== payload.sub || fila.revocadaEn || !fila.activo || new Date(fila.expiraEn).getTime() <= Date.now()) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    const filasRol: Array<{ rol: Rol }> = await this.ds.query('SELECT rol FROM usuario_rol WHERE usuario_id = ?', [payload.sub]);
    const roles = filasRol.map((r) => r.rol);
    const rolActivo = payload.rol ?? null;
    if (rolActivo !== null && !roles.includes(rolActivo)) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    request.user = {
      id: payload.sub,
      rol: rolActivo,
      roles,
      nombre: [fila.titulo, fila.nombres, fila.apellidoPaterno, fila.apellidoMaterno].filter((x) => !!x).join(' '),
      sesionId: String(fila.sesionId),
    };
    return true;
  }
}
