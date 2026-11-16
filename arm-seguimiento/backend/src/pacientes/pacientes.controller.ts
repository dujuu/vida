import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../usuarios/rol.enum.js';
import { ContactoPacienteDto, CrearPacienteDto, EditarPacienteDto, FiltroPacientesDto, FusionarPacientesDto } from './pacientes.dto.js';
import { PacientesService } from './pacientes.service.js';

/**
 * Registro administrativo de pacientes. Ninguna respuesta de este controlador incluye datos clínicos,
 * para ningún rol.
 */
@ApiTags('Pacientes')
@ApiBearerAuth()
@Controller()
export class PacientesController {
  constructor(private readonly pacientes: PacientesService) {}

  @Get('pacientes')
  @Roles(Rol.RECEPCIONISTA, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Buscar pacientes por RUT o nombre (solo datos administrativos).' })
  buscar(@Query() f: FiltroPacientesDto) {
    return this.pacientes.buscar(f);
  }

  @Post('pacientes')
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Registrar un paciente y generar su código de activación. Un RUT existente responde 409.' })
  crear(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: CrearPacienteDto) {
    return this.pacientes.crear(actor, dto);
  }

  @Get('pacientes/duplicados')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Posibles duplicados por nombre y fecha de nacimiento.' })
  duplicados() {
    return this.pacientes.duplicados();
  }

  @Post('pacientes/fusionar')
  @HttpCode(200)
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Unir dos registros de un mismo paciente. No tiene deshacer.' })
  fusionar(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: FusionarPacientesDto) {
    return this.pacientes.fusionar(actor, dto);
  }

  @Get('pacientes/:id')
  @Roles(Rol.RECEPCIONISTA, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Ficha administrativa de un paciente.' })
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.pacientes.detalle(id);
  }

  @Patch('pacientes/:id')
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Actualizar datos administrativos y de contacto.' })
  editar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarPacienteDto) {
    return this.pacientes.editar(actor, id, dto);
  }

  @Post('pacientes/:id/codigo')
  @HttpCode(200)
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Emitir un código de activación o de recuperación (entrega en persona).' })
  codigo(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.pacientes.emitirCodigo(actor, id);
  }

  @Get('mi-perfil')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Mis datos administrativos.' })
  miPerfil(@CurrentUser() actor: UsuarioAutenticado) {
    return this.pacientes.miPerfil(actor);
  }

  @Patch('mi-perfil')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Editar mi contacto y mis preferencias. No puedo cambiar RUT, nombre ni fecha de nacimiento.' })
  editarMiPerfil(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: ContactoPacienteDto) {
    return this.pacientes.editarMiPerfil(actor, dto);
  }
}
