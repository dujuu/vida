import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { limpiarTexto } from '../common/texto.util.js';
import { CUALQUIER_ROL, Rol } from '../usuarios/rol.enum.js';
import { PerfilProfesionalDto } from '../usuarios/usuarios.dto.js';
import { ProfesionalesService } from './profesionales.service.js';

/** Alta de una especialidad. */
export class CrearEspecialidadDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Ingrese el nombre' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres' })
  nombre: string;
}

/** Cambios a una especialidad. */
export class EditarEspecialidadDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres' })
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

/** Filtro de profesionales. */
export class FiltroProfesionalesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  especialidad?: number;
}

/** Especialidades y profesionales. */
@ApiTags('Profesionales')
@ApiBearerAuth()
@Controller()
export class ProfesionalesController {
  constructor(private readonly servicio: ProfesionalesService) {}

  @Get('especialidades')
  @Roles(...CUALQUIER_ROL)
  @ApiOperation({ summary: 'Catálogo de especialidades activas.' })
  especialidades() {
    return this.servicio.listarEspecialidades(false);
  }

  @Get('especialidades/todas')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Catálogo completo, con las desactivadas.' })
  todas() {
    return this.servicio.listarEspecialidades(true);
  }

  @Post('especialidades')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear una especialidad.' })
  crear(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: CrearEspecialidadDto) {
    return this.servicio.crearEspecialidad(actor, dto.nombre);
  }

  @Patch('especialidades/:id')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Renombrar, activar o desactivar una especialidad.' })
  editar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarEspecialidadDto) {
    return this.servicio.editarEspecialidad(actor, id, dto);
  }

  @Get('profesionales')
  @Roles(...CUALQUIER_ROL)
  @ApiOperation({ summary: 'Médicos activos para reservar: nombre, especialidad y presentación (sin RUT ni contacto).' })
  listar(@Query() filtro: FiltroProfesionalesDto) {
    return this.servicio.listar(filtro.especialidad);
  }

  @Get('profesionales/:id')
  @Roles(...CUALQUIER_ROL)
  @ApiOperation({ summary: 'Perfil público de un médico.' })
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }

  @Put('profesionales/:id')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Editar el perfil profesional de un médico.' })
  editarPerfil(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: PerfilProfesionalDto) {
    return this.servicio.editarPerfil(actor, id, dto);
  }
}
