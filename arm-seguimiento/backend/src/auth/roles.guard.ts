import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Rol } from '../usuarios/rol.enum.js';
import { ROLES_KEY } from './decorators.js';
import type { RequestConUsuario } from './usuario-autenticado.js';

/**
 * Guardia global de roles: si la ruta declara `@Roles(...)`, el rol activo de la sesión debe ser uno de ellos.
 * Una ruta sin `@Roles` queda abierta a cualquier usuario con sesión. Corre después de {@link JwtAuthGuard}.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requeridos || requeridos.length === 0) return true;
    const { user } = context.switchToHttp().getRequest<RequestConUsuario>();
    if (!user) throw new ForbiddenException('No tiene permisos para esta acción');
    if (user.rol === null) throw new ForbiddenException('Elija un perfil para continuar');
    if (!requeridos.includes(user.rol)) throw new ForbiddenException('No tiene permisos para esta acción');
    return true;
  }
}
