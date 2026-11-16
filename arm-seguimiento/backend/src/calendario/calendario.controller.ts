import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { REGEX_FECHA } from '../common/fechas.util.js';
import { limpiarTexto } from '../common/texto.util.js';
import { Rol } from '../usuarios/rol.enum.js';
import { CalendarioService } from './calendario.service.js';

/** Rango de fechas del calendario. */
export class RangoCalendarioDto {
  @Matches(REGEX_FECHA, { message: 'La fecha desde debe tener formato AAAA-MM-DD' })
  desde: string;

  @Matches(REGEX_FECHA, { message: 'La fecha hasta debe tener formato AAAA-MM-DD' })
  hasta: string;
}

/** Mes del resumen. */
export class MesDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'El mes debe tener formato AAAA-MM' })
  mes: string;
}

/** Marcar una toma como realizada. */
export class MarcarRealizadaDto {
  /** Hora en que la tomó, si no fue exactamente ahora (instante ISO 8601). */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'La hora real no es válida' })
  horaReal?: string;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(200, { message: 'La nota no puede superar los 200 caracteres' })
  nota?: string;
}

/** Marcar una toma como no tomada. */
export class MarcarOmitidaDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres' })
  nota?: string;
}

/** Calendario del paciente y registro de tomas. */
@ApiTags('Calendario')
@ApiBearerAuth()
@Controller()
export class CalendarioController {
  constructor(private readonly calendario: CalendarioService) {}

  @Get('calendario')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Mi calendario: tomas, citas e indicaciones vigentes de un rango (hasta 92 días).' })
  rango(@CurrentUser() actor: UsuarioAutenticado, @Query() q: RangoCalendarioDto) {
    return this.calendario.calendario(actor.id, q.desde, q.hasta);
  }

  @Get('calendario/hoy')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Lo de hoy, con lo atrasado primero.' })
  hoy(@CurrentUser() actor: UsuarioAutenticado) {
    return this.calendario.hoy(actor);
  }

  @Get('calendario/resumen-mes')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Por día del mes: tomas, tomas marcadas y si hay cita.' })
  resumen(@CurrentUser() actor: UsuarioAutenticado, @Query() q: MesDto) {
    return this.calendario.resumenMes(actor.id, q.mes);
  }

  @Post('eventos/:id/realizada')
  @HttpCode(200)
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Marcar una toma como realizada (autorreporte).' })
  realizada(@CurrentUser() actor: UsuarioAutenticado, @Param('id') id: string, @Body() dto: MarcarRealizadaDto) {
    return this.calendario.marcar(actor, id, 'realizada', dto);
  }

  @Post('eventos/:id/omitida')
  @HttpCode(200)
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Marcar una toma como no tomada.' })
  omitida(@CurrentUser() actor: UsuarioAutenticado, @Param('id') id: string, @Body() dto: MarcarOmitidaDto) {
    return this.calendario.marcar(actor, id, 'omitida', dto);
  }

  @Post('eventos/:id/deshacer')
  @HttpCode(200)
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Volver una toma a pendiente, dentro del plazo.' })
  deshacer(@CurrentUser() actor: UsuarioAutenticado, @Param('id') id: string) {
    return this.calendario.marcar(actor, id, 'deshacer');
  }

  @Get('ficha/:pacienteId/calendario')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'El calendario de un paciente suyo, en solo lectura.' })
  delPaciente(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Query() q: RangoCalendarioDto) {
    return this.calendario.delPaciente(actor, pacienteId, q.desde, q.hasta);
  }
}
