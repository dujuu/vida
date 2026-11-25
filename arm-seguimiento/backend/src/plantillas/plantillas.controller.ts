import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../usuarios/rol.enum.js';
import { CrearPlantillaDto, DirectorDto, EditarPlantillaDto } from './plantillas.dto.js';
import { PlantillasService } from './plantillas.service.js';

/** Plantillas de indicaciones. */
@ApiTags('Plantillas')
@ApiBearerAuth()
@Controller('plantillas')
export class PlantillasController {
  constructor(private readonly servicio: PlantillasService) {}

  @Get()
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Plantillas activas para elegir al indicar.' })
  listar() {
    return this.servicio.listar(false);
  }

  @Get('todas')
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Todas las plantillas, con las desactivadas (administración).' })
  todas(@CurrentUser() u: UsuarioAutenticado) {
    return this.servicio.puedeGestionar(u).then(({ puede }) => (puede ? this.servicio.listar(true) : []));
  }

  @Get('permiso')
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Indica si el usuario puede administrar plantillas.' })
  permiso(@CurrentUser() u: UsuarioAutenticado) {
    return this.servicio.puedeGestionar(u);
  }

  @Post()
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crea una plantilla (administrador o director médico).' })
  crear(@CurrentUser() u: UsuarioAutenticado, @Body() dto: CrearPlantillaDto) {
    return this.servicio.crear(u, dto);
  }

  @Put('directores/:medicoId')
  @Roles(Rol.ADMINISTRADOR)
  @HttpCode(204)
  @ApiOperation({ summary: 'Designa o retira a un director médico.' })
  director(@CurrentUser() u: UsuarioAutenticado, @Param('medicoId', ParseIntPipe) id: number, @Body() dto: DirectorDto) {
    return this.servicio.marcarDirector(u, id, dto.esDirector);
  }

  @Get('medicos')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Médicos y su marca de director.' })
  medicos() {
    return this.servicio.medicos();
  }

  @Put(':id')
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @HttpCode(204)
  @ApiOperation({ summary: 'Edita o desactiva una plantilla.' })
  editar(@CurrentUser() u: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarPlantillaDto) {
    return this.servicio.editar(u, id, dto);
  }
}
