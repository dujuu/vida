import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from './rol.enum.js';
import { AsignarRolesDto, CrearUsuarioDto, DatosPersonalesDto, FiltroUsuariosDto } from './usuarios.dto.js';
import { UsuariosService } from './usuarios.service.js';

/** Gestión de usuarios y roles. Solo el administrador; nunca devuelve datos clínicos. */
@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('usuarios')
@Roles(Rol.ADMINISTRADOR)
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios con filtros por rol, estado y texto.' })
  listar(@Query() filtro: FiltroUsuariosDto) {
    return this.usuarios.listar(filtro);
  }

  @Post()
  @ApiOperation({ summary: 'Crear personal (o agregar roles si el RUT ya existe) y generar el código de activación.' })
  crear(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: CrearUsuarioDto) {
    return this.usuarios.crear(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Datos administrativos y roles de un usuario.' })
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.usuarios.detalle(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modificar datos administrativos (el RUT no cambia).' })
  editar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: DatosPersonalesDto) {
    return this.usuarios.editar(actor, id, dto);
  }

  @Put(':id/roles')
  @ApiOperation({ summary: 'Asignar o quitar roles. Siempre debe quedar un administrador activo.' })
  roles(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: AsignarRolesDto) {
    return this.usuarios.asignarRoles(actor, id, dto);
  }

  @Post(':id/desactivar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Desactivar la cuenta: corta el acceso de inmediato y cierra sus sesiones.' })
  desactivar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.usuarios.cambiarEstado(actor, id, false);
  }

  @Post(':id/activar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reactivar una cuenta desactivada.' })
  activar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.usuarios.cambiarEstado(actor, id, true);
  }

  @Post(':id/codigo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Emitir un código de activación o recuperación y cerrar las sesiones del usuario.' })
  codigo(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.usuarios.emitirCodigo(actor, id);
  }
}
