import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, Matches } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { REGEX_FECHA } from '../common/fechas.util.js';
import { CUALQUIER_ROL, Rol } from '../usuarios/rol.enum.js';
import { CancelarCitaDto, FiltroCitasDto, FiltroMisCitasDto, FinalizarCitaDto, ReprogramarCitaDto, ReservarCitaDto } from './citas.dto.js';
import { CitasService } from './citas.service.js';

/** Rango de fechas de la agenda del médico. */
export class FiltroAgendaMedicoDto {
  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  fecha?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha desde debe tener formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha hasta debe tener formato AAAA-MM-DD' })
  hasta?: string;
}

/** Reservar, consultar y cambiar el estado de las citas. */
@ApiTags('Citas')
@ApiBearerAuth()
@Controller()
export class CitasController {
  constructor(private readonly citas: CitasService) {}

  @Post('citas')
  @Roles(Rol.PACIENTE, Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Reservar una hora. La doble reserva responde 409 con las horas actualizadas.' })
  reservar(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: ReservarCitaDto) {
    return this.citas.reservar(actor, dto);
  }

  @Get('citas/mias')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Mis citas: próximas o historial.' })
  mias(@CurrentUser() actor: UsuarioAutenticado, @Query() f: FiltroMisCitasDto) {
    return this.citas.mias(actor, f);
  }

  @Get('citas')
  @Roles(Rol.RECEPCIONISTA, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Agenda diaria o semanal con filtros (el administrador no ve las notas).' })
  agenda(@CurrentUser() actor: UsuarioAutenticado, @Query() f: FiltroCitasDto) {
    return this.citas.agendaGeneral(actor, f);
  }

  @Get('medico/citas')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Mi agenda del día o de la semana.' })
  delMedico(@CurrentUser() actor: UsuarioAutenticado, @Query() f: FiltroAgendaMedicoDto) {
    return this.citas.delMedico(actor, f.fecha, f.desde, f.hasta);
  }

  @Get('citas/:id')
  @Roles(...CUALQUIER_ROL)
  @ApiOperation({ summary: 'Detalle de una cita con su historial de estados.' })
  detalle(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.citas.detalle(actor, id);
  }

  @Post('citas/:id/cancelar')
  @HttpCode(200)
  @Roles(Rol.PACIENTE, Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Cancelar con motivo. El paciente, hasta el plazo configurado.' })
  cancelar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelarCitaDto) {
    return this.citas.cancelar(actor, id, dto);
  }

  @Post('citas/:id/reprogramar')
  @HttpCode(200)
  @Roles(Rol.PACIENTE, Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Cambiar la hora: cancela y reserva la nueva en una sola operación.' })
  reprogramar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: ReprogramarCitaDto) {
    return this.citas.reprogramar(actor, id, dto.inicio);
  }

  @Post('citas/:id/llegada')
  @HttpCode(200)
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Registrar la llegada del paciente (solo el día de la cita).' })
  llegada(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.citas.llegada(actor, id);
  }

  @Post('citas/:id/iniciar')
  @HttpCode(200)
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Iniciar la atención.' })
  iniciar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.citas.iniciar(actor, id);
  }

  @Post('citas/:id/finalizar')
  @HttpCode(200)
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Cerrar la atención. Exige una atención clínica cerrada o declarar que no hubo.' })
  finalizar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: FinalizarCitaDto) {
    return this.citas.finalizar(actor, id, dto);
  }

  @Post('citas/:id/no-asistio')
  @HttpCode(200)
  @Roles(Rol.RECEPCIONISTA, Rol.MEDICO)
  @ApiOperation({ summary: 'Marcar inasistencia de una cita que ya ocurrió.' })
  noAsistio(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.citas.noAsistio(actor, id);
  }
}
