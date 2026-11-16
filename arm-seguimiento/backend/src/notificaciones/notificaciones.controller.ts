import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PaginacionDto } from '../common/paginacion.js';
import { CUALQUIER_ROL } from '../usuarios/rol.enum.js';
import { NotificacionesService } from './notificaciones.service.js';

/** Filtro de la bandeja. */
export class FiltroNotificacionesDto extends PaginacionDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  soloNoLeidas?: boolean;
}

/** Cambio de preferencias de aviso. */
export class PreferenciasDto {
  @IsOptional()
  @IsBoolean()
  avisosTomas?: boolean;

  @IsOptional()
  @IsBoolean()
  avisosCitas?: boolean;

  @IsOptional()
  @IsString()
  silencioDesde?: string | null;

  @IsOptional()
  @IsString()
  silencioHasta?: string | null;
}

/** Bandeja de avisos y preferencias del usuario. */
@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('notificaciones')
@Roles(...CUALQUIER_ROL)
export class NotificacionesController {
  constructor(private readonly servicio: NotificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Mi bandeja de avisos.' })
  listar(@CurrentUser() actor: UsuarioAutenticado, @Query() f: FiltroNotificacionesDto) {
    return this.servicio.listar(actor.id, f.soloNoLeidas === true, f);
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Avisos sin leer y tomas por vencer o atrasadas. Es la consulta periódica de la pantalla.' })
  resumen(@CurrentUser() actor: UsuarioAutenticado) {
    return this.servicio.resumen(actor);
  }

  @Post('leer-todas')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar todos mis avisos como leídos.' })
  leerTodas(@CurrentUser() actor: UsuarioAutenticado) {
    return this.servicio.leerTodas(actor.id);
  }

  @Get('preferencias')
  @ApiOperation({ summary: 'Mis preferencias de aviso.' })
  preferencias(@CurrentUser() actor: UsuarioAutenticado) {
    return this.servicio.preferencias(actor.id);
  }

  @Put('preferencias')
  @ApiOperation({ summary: 'Cambiar mis preferencias de aviso.' })
  guardar(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: PreferenciasDto) {
    return this.servicio.guardarPreferencias(actor.id, dto);
  }

  @Post(':id/leida')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar un aviso como leído.' })
  leida(@CurrentUser() actor: UsuarioAutenticado, @Param('id') id: string) {
    return this.servicio.marcarLeida(actor.id, id);
  }
}
