import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../usuarios/rol.enum.js';
import {
  CrearRecomendacionDto,
  EditarRecomendacionDto,
  FiltroRecomendacionesDto,
  ModificarPautaDto,
  SuspenderRecomendacionDto,
  VistaPreviaDto,
} from './crear-recomendacion.dto.js';
import { RecomendacionesService } from './recomendaciones.service.js';

/** Indicaciones del médico al paciente, con pauta horaria, versiones y suspensión. */
@ApiTags('Recomendaciones')
@ApiBearerAuth()
@Controller()
export class RecomendacionesController {
  constructor(private readonly servicio: RecomendacionesService) {}

  @Post('recomendaciones')
  @Roles(Rol.MEDICO)
  @ApiOperation({
    summary: 'Crear una indicación para un paciente suyo, con o sin pauta horaria.',
    description:
      'Los datos del medicamento (nombre, dosis, vía) y la pauta los escribe siempre el médico. Con pauta, el sistema genera ' +
      'las tomas del calendario del paciente en la misma transacción. Responde 404 si el paciente no es suyo.',
  })
  crear(@CurrentUser() medico: UsuarioAutenticado, @Body() dto: CrearRecomendacionDto) {
    return this.servicio.crear(medico, dto);
  }

  @Post('recomendaciones/vista-previa')
  @HttpCode(200)
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Lista las tomas que generaría una pauta, sin guardar. El médico la confirma antes de crear.' })
  vistaPrevia(@Body() dto: VistaPreviaDto) {
    return this.servicio.vistaPrevia(dto.pauta);
  }

  @Get('recomendaciones/emitidas')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Indicaciones que emití, de la más nueva a la más antigua, con filtros y paginación.' })
  emitidas(@CurrentUser() medico: UsuarioAutenticado, @Query() f: FiltroRecomendacionesDto) {
    return this.servicio.emitidas(medico.id, f);
  }

  @Get('recomendaciones/mias')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Indicaciones que recibí de cualquiera de mis médicos: vigentes o anteriores.' })
  mias(@CurrentUser() paciente: UsuarioAutenticado, @Query() f: FiltroRecomendacionesDto) {
    return this.servicio.mias(paciente.id, f);
  }

  @Get('ficha/:pacienteId/indicaciones')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Todas las indicaciones de un paciente suyo, de cualquier médico.' })
  delPaciente(@CurrentUser() medico: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Query() f: FiltroRecomendacionesDto) {
    return this.servicio.delPaciente(medico, pacienteId, f);
  }

  @Get('recomendaciones/:id')
  @Roles(Rol.MEDICO, Rol.PACIENTE)
  @ApiOperation({ summary: 'Detalle con historial de versiones, pauta vigente y resumen de tomas (autorreporte).' })
  detalle(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalle(actor, id);
  }

  @Put('recomendaciones/:id/pauta')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Modificar la pauta: crea una versión nueva y conserva lo ya registrado. Solo el autor.' })
  modificarPauta(@CurrentUser() medico: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: ModificarPautaDto) {
    return this.servicio.modificarPauta(medico, id, dto);
  }

  @Patch('recomendaciones/:id/leida')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Marcar como leída. Es idempotente: conserva la fecha original.' })
  marcarLeida(@CurrentUser() paciente: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.servicio.marcarLeida(paciente.id, id);
  }

  @Patch('recomendaciones/:id')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Corregir título, texto o fecha de término, con motivo. Solo el autor; guarda la versión anterior.' })
  editar(@CurrentUser() medico: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarRecomendacionDto) {
    return this.servicio.editar(medico, id, dto);
  }

  @Post('recomendaciones/:id/suspender')
  @HttpCode(200)
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Suspender con motivo. Cualquier médico con relación vigente con el paciente puede hacerlo.' })
  suspender(@CurrentUser() medico: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: SuspenderRecomendacionDto) {
    return this.servicio.suspender(medico, id, dto.motivo);
  }
}
