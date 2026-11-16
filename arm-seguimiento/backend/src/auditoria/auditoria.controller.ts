import { Controller, Get, Header, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PaginacionDto } from '../common/paginacion.js';
import { Rol } from '../usuarios/rol.enum.js';
import { Accion, AuditoriaService } from './auditoria.service.js';
import { FiltroAuditoriaDto } from './auditoria.dto.js';

/** Consulta de la auditoría por el administrador, y de los accesos a la propia ficha por el paciente. */
@ApiTags('Auditoría')
@ApiBearerAuth()
@Controller()
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get('auditoria')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Consultar la auditoría con filtros (el administrador no ve contenido clínico).' })
  async listar(@CurrentUser() actor: UsuarioAutenticado, @Query() filtro: FiltroAuditoriaDto) {
    await this.auditoria.registrar(actor, Accion.AUDITORIA_CONSULTAR, { recurso: 'auditoria' });
    return this.auditoria.listar(filtro);
  }

  @Get('auditoria/paciente/:id')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Historial de accesos a un paciente.' })
  async porPaciente(
    @CurrentUser() actor: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Query() filtro: FiltroAuditoriaDto,
  ) {
    await this.auditoria.registrar(actor, Accion.AUDITORIA_CONSULTAR, { recurso: 'auditoria', pacienteId: id });
    return this.auditoria.listar({ ...filtro, paciente: id });
  }

  @Get('auditoria/exportar')
  @Roles(Rol.ADMINISTRADOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="auditoria.csv"')
  @ApiOperation({ summary: 'Descargar el resultado filtrado en CSV.' })
  async exportar(@CurrentUser() actor: UsuarioAutenticado, @Query() filtro: FiltroAuditoriaDto) {
    await this.auditoria.registrar(actor, Accion.AUDITORIA_CONSULTAR, { recurso: 'auditoria', detalle: 'exportar' });
    return this.auditoria.exportarCsv(filtro);
  }

  @Get('mi-ficha/accesos')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Quién abrió mi ficha y cuándo.' })
  misAccesos(@CurrentUser() actor: UsuarioAutenticado, @Query() pag: PaginacionDto) {
    return this.auditoria.accesosAPaciente(actor.id, pag as FiltroAuditoriaDto);
  }
}
