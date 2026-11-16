import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PaginacionDto } from '../common/paginacion.js';
import { limpiarTexto } from '../common/texto.util.js';
import { Rol } from '../usuarios/rol.enum.js';
import { RelacionesService } from './relaciones.service.js';

/** Filtros de la lista de pacientes de un médico. */
export class FiltroMisPacientesDto extends PaginacionDto {
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(60)
  buscar?: string;

  /** Incluir los pacientes con relación cerrada. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  cerradas?: boolean;
}

/** Crear una relación a mano. */
export class CrearRelacionDto {
  @Type(() => Number)
  @IsInt({ message: 'Seleccione un médico' })
  @Min(1, { message: 'Seleccione un médico' })
  medicoId: number;

  @Type(() => Number)
  @IsInt({ message: 'Seleccione un paciente' })
  @Min(1, { message: 'Seleccione un paciente' })
  pacienteId: number;
}

/** Cerrar una relación. */
export class CerrarRelacionDto {
  @Transform(limpiarTexto)
  @IsString({ message: 'Indique el motivo' })
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres' })
  motivo: string;
}

/** Relaciones médico–paciente. */
@ApiTags('Relaciones médico–paciente')
@ApiBearerAuth()
@Controller()
export class RelacionesController {
  constructor(private readonly relaciones: RelacionesService) {}

  @Get('medico/pacientes')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Mis pacientes, con búsqueda. No existe forma de pedir los de otro médico.' })
  mios(@CurrentUser() medico: UsuarioAutenticado, @Query() f: FiltroMisPacientesDto) {
    return this.relaciones.pacientesDe(medico.id, f.buscar, f.cerradas === true, f);
  }

  @Get('pacientes/:id/medicos')
  @Roles(Rol.RECEPCIONISTA, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Médicos vinculados a un paciente.' })
  medicos(@Param('id', ParseIntPipe) id: number) {
    return this.relaciones.medicosDe(id);
  }

  @Get('mis-medicos')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Médicos que me atienden.' })
  misMedicos(@CurrentUser() paciente: UsuarioAutenticado) {
    return this.relaciones.medicosDe(paciente.id);
  }

  @Post('relaciones')
  @HttpCode(204)
  @Roles(Rol.RECEPCIONISTA, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear el vínculo médico–paciente a mano.' })
  crear(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: CrearRelacionDto) {
    return this.relaciones.crearManual(actor, dto.medicoId, dto.pacienteId);
  }

  @Post('relaciones/:medicoId/:pacienteId/cerrar')
  @HttpCode(204)
  @Roles(Rol.MEDICO, Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Cerrar la relación con un motivo.' })
  cerrar(
    @CurrentUser() actor: UsuarioAutenticado,
    @Param('medicoId', ParseIntPipe) medicoId: number,
    @Param('pacienteId', ParseIntPipe) pacienteId: number,
    @Body() dto: CerrarRelacionDto,
  ) {
    return this.relaciones.cerrar(actor, medicoId, pacienteId, dto.motivo);
  }
}
