import { ApiProperty } from '@nestjs/swagger';
import { Rol } from '../usuarios/rol.enum.js';

/** Usuario tal como lo recibe el frontend al iniciar sesión y en `/auth/me`. */
export class UsuarioSesionDto {
  @ApiProperty({ description: 'Identificador del usuario.', example: 1 })
  id: number;

  @ApiProperty({ description: 'Nombre completo, tal como se muestra en pantalla.', example: 'Dr. Rodrigo Salas' })
  nombre: string;

  @ApiProperty({ description: 'RUT con puntos y guion.', example: '12.345.678-5' })
  rut: string;

  @ApiProperty({ enum: Rol, isArray: true, description: 'Todos los roles del usuario.' })
  roles: Rol[];

  @ApiProperty({ enum: Rol, nullable: true, description: 'Rol activo de la sesión; nulo hasta que elige perfil.' })
  rol: Rol | null;

  @ApiProperty({ description: 'Especialidad del médico. Nula para los demás.', example: 'Medicina General', type: String, nullable: true })
  especialidad: string | null;

  @ApiProperty({ description: 'Si debe cambiar su contraseña antes de seguir.' })
  debeCambiarPassword: boolean;
}

/** Respuesta de login, de renovación y de elegir perfil. */
export class LoginRespuestaDto {
  @ApiProperty({ description: 'Token de acceso, de corta duración. Se envía como `Authorization: Bearer <token>`.' })
  accessToken: string;

  @ApiProperty({ type: UsuarioSesionDto })
  usuario: UsuarioSesionDto;
}
