import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ActivarCuentaDto, CambiarPasswordDto, ElegirRolDto } from './auth.dto.js';
import { LoginRespuestaDto } from './auth.respuestas.js';
import { AuthService, type ResultadoSesion } from './auth.service.js';
import { CurrentUser, Public } from './decorators.js';
import { LoginDto } from './login.dto.js';
import { COOKIE_RENOVACION, leerCookie } from './seguridad.util.js';
import { UsuarioAutenticado } from './usuario-autenticado.js';

/** Inicio y cierre de sesión, renovación, perfil activo, activación de cuentas y contraseña. */
@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Pone o borra la cookie de renovación (httpOnly, mismo sitio, solo en las rutas de autenticación). */
  private escribirCookie(res: Response, cookie: ResultadoSesion['cookie']): void {
    if (!cookie) return;
    res.cookie(COOKIE_RENOVACION, cookie.valor, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/api/auth',
      expires: cookie.expira,
    });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Comprueba RUT y contraseña. Devuelve un token de acceso de 15 minutos y deja una cookie de renovación. ' +
      'Si el usuario tiene más de un rol, `usuario.rol` viene nulo hasta que elige perfil en `POST /auth/rol`. ' +
      'Tras 5 intentos fallidos el RUT queda bloqueado por 15 minutos.',
  })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<LoginRespuestaDto> {
    const r = await this.auth.login(dto.rut, dto.password);
    this.escribirCookie(res, r.cookie);
    return r.respuesta;
  }

  @Public()
  @Post('clave-unica-simulada')
  @HttpCode(200)
  @ApiOperation({ summary: 'Clave Única simulada (demostración): mismo acceso que el login, registrado como simulación.' })
  async claveUnica(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<LoginRespuestaDto> {
    const r = await this.auth.login(dto.rut, dto.password, 'CLAVE_UNICA_SIMULADA');
    this.escribirCookie(res, r.cookie);
    return r.respuesta;
  }

  @Public()
  @Post('activar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Activar la cuenta (o recuperar el acceso) con un código de un solo uso y elegir contraseña.' })
  async activar(@Body() dto: ActivarCuentaDto, @Res({ passthrough: true }) res: Response): Promise<LoginRespuestaDto> {
    const r = await this.auth.activar(dto);
    this.escribirCookie(res, r.cookie);
    return r.respuesta;
  }

  @Public()
  @Post('renovar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar la sesión con la cookie de renovación; devuelve un token de acceso nuevo.' })
  async renovar(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginRespuestaDto> {
    const r = await this.auth.renovar(leerCookie(req.headers.cookie, COOKIE_RENOVACION));
    this.escribirCookie(res, r.cookie);
    return r.respuesta;
  }

  @ApiBearerAuth()
  @Post('rol')
  @HttpCode(200)
  @ApiOperation({ summary: 'Elegir o cambiar el perfil (rol) con el que se actúa; devuelve un token nuevo.' })
  elegirRol(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: ElegirRolDto): Promise<LoginRespuestaDto> {
    return this.auth.elegirRol(actor, dto.rol);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cerrar la sesión: se revoca en el servidor.' })
  async logout(@CurrentUser() actor: UsuarioAutenticado, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(actor);
    res.clearCookie(COOKIE_RENOVACION, { path: '/api/auth' });
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Usuario autenticado, con sus roles y el rol activo, según la base de datos.' })
  me(@CurrentUser() actor: UsuarioAutenticado) {
    return this.auth.usuarioSesion(actor.id, actor.rol);
  }

  @ApiBearerAuth()
  @Post('password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cambiar la contraseña propia; cierra las demás sesiones.' })
  cambiarPassword(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: CambiarPasswordDto): Promise<void> {
    return this.auth.cambiarPassword(actor, dto.actual, dto.nueva);
  }

  @ApiBearerAuth()
  @Get('sesiones')
  @ApiOperation({ summary: 'Mis sesiones activas.' })
  sesiones(@CurrentUser() actor: UsuarioAutenticado) {
    return this.auth.listarSesiones(actor);
  }

  @ApiBearerAuth()
  @Delete('sesiones/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cerrar una de mis sesiones.' })
  cerrarSesion(@CurrentUser() actor: UsuarioAutenticado, @Param('id') id: string): Promise<void> {
    return this.auth.cerrarSesion(actor, id);
  }
}
