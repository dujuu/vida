import { ApiProperty } from '@nestjs/swagger';
import type { Request } from 'express';
import { Rol } from '../usuarios/rol.enum.js';

/** Usuario que hace la petición, tal como lo deja el guardia después de verificarlo en la base de datos. */
export class UsuarioAutenticado {
  @ApiProperty({ description: 'Identificador del usuario.', example: 3 })
  id: number;

  @ApiProperty({
    enum: Rol,
    nullable: true,
    description: 'Rol con el que actúa en esta sesión. Es nulo hasta que elige perfil si tiene más de uno.',
    example: Rol.PACIENTE,
  })
  rol: Rol | null;

  @ApiProperty({ enum: Rol, isArray: true, description: 'Todos los roles vigentes del usuario.' })
  roles: Rol[];

  @ApiProperty({ description: 'Nombre completo.', example: 'Ana Muñoz' })
  nombre: string;

  @ApiProperty({ description: 'Identificador de la sesión.', example: '12' })
  sesionId: string;
}

/** Contenido del token de acceso. */
export interface JwtPayload {
  /** Id del usuario. */
  sub: number;
  /** Id de la sesión, que se puede revocar. */
  sid: string;
  /** Rol activo, o nulo si el usuario aún no elige perfil. */
  rol: Rol | null;
}

/** Petición con el usuario ya verificado. */
export type RequestConUsuario = Request & { user?: UsuarioAutenticado };
