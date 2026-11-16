import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { REGEX_FECHA } from '../common/fechas.util.js';
import { limpiarTexto } from '../common/texto.util.js';
import { Rol } from '../usuarios/rol.enum.js';
import type { EstadoContinuidad } from './continuidad.js';
import { SeguimientoService } from './seguimiento.service.js';

/** Filtros del dashboard del médico. */
export class FiltroDashboardMedicoDto {
  @IsOptional()
  @IsIn(['AL_DIA', 'EN_RIESGO', 'DESERTOR', 'CERRADO'], { message: 'Estado inválido' })
  estado?: EstadoContinuidad;

  @IsOptional()
  @Transform(limpiarTexto)
  @IsString()
  @MaxLength(60)
  buscar?: string;
}

/** Filtros del dashboard del centro. */
export class FiltroDashboardCentroDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  especialidad?: number;

  @IsOptional()
  @Matches(REGEX_FECHA, { message: 'La fecha debe tener formato AAAA-MM-DD' })
  desde?: string;
}

/** Seguimiento de tratamientos y dashboard de continuidad. Los datos de tomas son un autorreporte del paciente. */
@ApiTags('Seguimiento')
@ApiBearerAuth()
@Controller()
export class SeguimientoController {
  constructor(private readonly seguimiento: SeguimientoService) {}

  @Get('dashboard/medico')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Mis pacientes clasificados por continuidad (al día, en riesgo, desertor, cerrado), con filtros.' })
  medico(@CurrentUser() actor: UsuarioAutenticado, @Query() f: FiltroDashboardMedicoDto) {
    return this.seguimiento.dashboardMedico(actor, f.estado, f.buscar);
  }

  @Get('dashboard/desertores')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Mis pacientes en estado desertor.' })
  desertores(@CurrentUser() actor: UsuarioAutenticado) {
    return this.seguimiento.dashboardMedico(actor, 'DESERTOR').then((r) => ({ rotulo: r.rotulo, pacientes: r.pacientes }));
  }

  @Get('dashboard/lectura')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Lectura de mis indicaciones por paciente y por tipo (gráficos del resumen).' })
  lectura(@CurrentUser() actor: UsuarioAutenticado) {
    return this.seguimiento.lectura(actor);
  }

  @Get('dashboard/centro')
  @Roles(Rol.ADMINISTRADOR)
  @ApiOperation({ summary: 'Cifras agregadas del centro, sin nombres. Los grupos de menos de 5 se muestran como «menos de 5».' })
  centro(@CurrentUser() actor: UsuarioAutenticado, @Query() f: FiltroDashboardCentroDto) {
    return this.seguimiento.dashboardCentro(actor, f.especialidad, f.desde);
  }

  @Get('seguimiento/indicacion/:id')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Tomas realizadas, omitidas y sin registro por día de una indicación (autorreporte).' })
  indicacion(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.seguimiento.deIndicacion(actor, id);
  }

  @Get('seguimiento/paciente/:id')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Resumen de un paciente suyo: continuidad, lectura, tomas y citas.' })
  paciente(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.seguimiento.dePaciente(actor, id);
  }
}
