import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../usuarios/rol.enum.js';
import {
  ConsultaAdvertenciasDto,
  CrearContactoDto,
  EditarContactoDto,
  EnvioSimuladoDto,
  FiltroContactosDto,
  SolicitarSeguimientoDto,
} from './contactos.dto.js';
import { ContactosService } from './contactos.service.js';

/** Formulario estandarizado de contacto con los pacientes. */
@ApiTags('Contactos')
@ApiBearerAuth()
@Controller()
export class ContactosController {
  constructor(private readonly contactos: ContactosService) {}

  @Post('contactos')
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Registrar un contacto (llamada, WhatsApp, correo o presencial).' })
  crear(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: CrearContactoDto) {
    return this.contactos.crear(actor, dto);
  }

  @Post('contactos/simulado')
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Registrar un envío simulado por WhatsApp o correo (no sale ningún mensaje real).' })
  simulado(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: EnvioSimuladoDto) {
    return this.contactos.enviarSimulado(actor, dto);
  }

  @Get('contactos/advertencias')
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Advertencias antes de contactar: medio preferido y tope de frecuencia.' })
  advertencias(@Query() q: ConsultaAdvertenciasDto) {
    return this.contactos.advertencias(q.paciente, q.medio);
  }

  @Get('contactos/pendientes')
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Contactos con seguimiento vencido o para hoy.' })
  pendientes(@CurrentUser() actor: UsuarioAutenticado) {
    return this.contactos.pendientes(actor);
  }

  @Get('contactos')
  @Roles(Rol.RECEPCIONISTA, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Listar contactos con filtros (el administrador no ve el detalle).' })
  listar(@CurrentUser() actor: UsuarioAutenticado, @Query() f: FiltroContactosDto) {
    return this.contactos.listar(actor, f);
  }

  @Patch('contactos/:id')
  @Roles(Rol.RECEPCIONISTA)
  @ApiOperation({ summary: 'Completar el resultado, fijar el próximo contacto, cerrar el seguimiento o agregar una nota.' })
  editar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarContactoDto) {
    return this.contactos.editar(actor, id, dto);
  }

  @Get('pacientes/:id/contactos')
  @Roles(Rol.RECEPCIONISTA, Rol.MEDICO)
  @ApiOperation({ summary: 'Historial de contactos de un paciente (el médico, solo si lo atiende).' })
  delPaciente(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Query() f: FiltroContactosDto) {
    return this.contactos.delPaciente(actor, id, f);
  }

  @Post('pacientes/:id/solicitar-seguimiento')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Pedir a recepción que contacte a un paciente en riesgo de abandonar su tratamiento.' })
  solicitar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: SolicitarSeguimientoDto) {
    return this.contactos.solicitarSeguimiento(actor, id, dto.mensaje);
  }
}
