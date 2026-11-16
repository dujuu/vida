import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CUALQUIER_ROL, Rol } from '../usuarios/rol.enum.js';
import { CrearBloqueoDto, CrearFeriadoDto, DiasConHorasDto, RangoHorasDto, ReemplazarBloquesDto } from './agenda.dto.js';
import { AgendaService } from './agenda.service.js';

/** Disponibilidad de los médicos: horario semanal, bloqueos, feriados y horas libres. */
@ApiTags('Agenda')
@ApiBearerAuth()
@Controller()
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get('agenda/dias-con-horas')
  @Roles(...CUALQUIER_ROL)
  @ApiOperation({ summary: 'Días del mes con al menos una hora libre en una especialidad (para pintar el calendario de reservas).' })
  dias(@CurrentUser() actor: UsuarioAutenticado, @Query() q: DiasConHorasDto) {
    return this.agenda.diasConHoras(q.especialidad, q.mes, actor.rol === Rol.PACIENTE);
  }

  @Get('agenda/:medicoId/bloques')
  @Roles(Rol.MEDICO, Rol.RECEPCIONISTA, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Horario semanal vigente de un médico.' })
  bloques(@Param('medicoId', ParseIntPipe) medicoId: number) {
    return this.agenda.bloques(medicoId);
  }

  @Put('agenda/:medicoId/bloques')
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Reemplazar el horario semanal desde una fecha. Las citas reservadas no se tocan.' })
  reemplazar(@CurrentUser() actor: UsuarioAutenticado, @Param('medicoId', ParseIntPipe) medicoId: number, @Body() dto: ReemplazarBloquesDto) {
    return this.agenda.reemplazarBloques(actor, medicoId, dto);
  }

  @Get('agenda/:medicoId/bloqueos')
  @Roles(Rol.MEDICO, Rol.RECEPCIONISTA, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Bloqueos vigentes o futuros de un médico.' })
  bloqueos(@Param('medicoId', ParseIntPipe) medicoId: number) {
    return this.agenda.bloqueos(medicoId);
  }

  @Post('agenda/:medicoId/bloqueos')
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Bloquear horas. Si hay citas dentro, se informan y hay que confirmar; nunca se cancelan solas.' })
  crearBloqueo(@CurrentUser() actor: UsuarioAutenticado, @Param('medicoId', ParseIntPipe) medicoId: number, @Body() dto: CrearBloqueoDto) {
    return this.agenda.crearBloqueo(actor, medicoId, dto);
  }

  @Delete('agenda/:medicoId/bloqueos/:id')
  @HttpCode(204)
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Quitar un bloqueo.' })
  borrarBloqueo(@CurrentUser() actor: UsuarioAutenticado, @Param('medicoId', ParseIntPipe) medicoId: number, @Param('id', ParseIntPipe) id: number) {
    return this.agenda.borrarBloqueo(actor, medicoId, id);
  }

  @Get('agenda/:medicoId/horas-libres')
  @Roles(...CUALQUIER_ROL)
  @ApiOperation({ summary: 'Horas libres de un médico entre dos fechas (hasta 35 días).' })
  horasLibres(@CurrentUser() actor: UsuarioAutenticado, @Param('medicoId', ParseIntPipe) medicoId: number, @Query() q: RangoHorasDto) {
    return this.agenda.horasLibres(medicoId, q.desde, q.hasta, actor.rol === Rol.PACIENTE);
  }

  @Get('feriados')
  @Roles(...CUALQUIER_ROL)
  @ApiOperation({ summary: 'Feriados del centro.' })
  feriados() {
    return this.agenda.listarFeriados();
  }

  @Post('feriados')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Agregar un feriado.' })
  crearFeriado(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: CrearFeriadoDto) {
    return this.agenda.crearFeriado(actor, dto.fecha, dto.nombre);
  }

  @Delete('feriados/:fecha')
  @HttpCode(204)
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Quitar un feriado.' })
  borrarFeriado(@CurrentUser() actor: UsuarioAutenticado, @Param('fecha') fecha: string) {
    return this.agenda.borrarFeriado(actor, fecha);
  }
}
