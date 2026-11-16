import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../usuarios/rol.enum.js';
import { TAMANO_MAXIMO_DOCUMENTO } from './archivos.util.js';
import { DocumentosService } from './documentos.service.js';
import {
  CrearAntecedenteDto,
  CrearAtencionDto,
  CrearDiagnosticoDto,
  CrearExamenDto,
  EditarAntecedenteDto,
  EditarAtencionDto,
  EditarDiagnosticoDto,
  EditarExamenDto,
  EnmiendaDto,
  FiltroAntecedentesDto,
  FiltroAtencionesDto,
  SignosVitalesDto,
  SubirDocumentoDto,
} from './ficha.dto.js';
import { FichaService } from './ficha.service.js';

/**
 * Ficha clínica. Todas las rutas son del médico con relación vigente (o del propio paciente en `/mi-ficha`);
 * recepción y administración reciben 403. Cada lectura y cada escritura queda en auditoría.
 */
@ApiTags('Ficha clínica')
@ApiBearerAuth()
@Controller()
export class FichaController {
  constructor(
    private readonly ficha: FichaService,
    private readonly documentos: DocumentosService,
  ) {}

  // ── Resumen y exportación ──

  @Get('ficha/:pacienteId')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Resumen de la ficha: alergias, problemas activos, indicaciones activas y últimas atenciones.' })
  resumen(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number) {
    return this.ficha.resumen(actor, pacienteId);
  }

  @Get('ficha/:pacienteId/exportar')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Ficha completa lista para imprimir o guardar como PDF. Queda en auditoría.' })
  exportar(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number) {
    return this.ficha.exportar(actor, pacienteId);
  }

  @Get('mi-ficha')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Lo que el paciente puede ver de su ficha: identificación, antecedentes, atenciones, diagnósticos, exámenes con resultado e indicaciones.' })
  miFicha(@CurrentUser() actor: UsuarioAutenticado) {
    return this.ficha.miFicha(actor);
  }

  @Get('mi-ficha/exportar')
  @Roles(Rol.PACIENTE)
  @ApiOperation({ summary: 'Mi ficha lista para imprimir o guardar como PDF.' })
  miFichaExportar(@CurrentUser() actor: UsuarioAutenticado) {
    return this.ficha.miFichaExportar(actor);
  }

  // ── Antecedentes ──

  @Get('ficha/:pacienteId/antecedentes')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Antecedentes del paciente.' })
  antecedentes(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Query() f: FiltroAntecedentesDto) {
    return this.ficha.listarAntecedentes(actor, pacienteId, f);
  }

  @Post('ficha/:pacienteId/antecedentes')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Agregar un antecedente (mórbido, quirúrgico, familiar, alergia, hábito o medicamento habitual).' })
  crearAntecedente(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Body() dto: CrearAntecedenteDto) {
    return this.ficha.crearAntecedente(actor, pacienteId, dto);
  }

  @Patch('antecedentes/:id')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Corregir o cerrar un antecedente. No se borra.' })
  editarAntecedente(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarAntecedenteDto) {
    return this.ficha.editarAntecedente(actor, id, dto);
  }

  // ── Atenciones ──

  @Get('ficha/:pacienteId/atenciones')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Historial de atenciones (los borradores solo los ve su autor).' })
  atenciones(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Query() f: FiltroAtencionesDto) {
    return this.ficha.listarAtenciones(actor, pacienteId, f);
  }

  @Post('atenciones')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Abrir una atención en borrador, desde una cita o sin ella.' })
  crearAtencion(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: CrearAtencionDto) {
    return this.ficha.crearAtencion(actor, dto);
  }

  @Get('atenciones/:id')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Detalle de una atención con signos, enmiendas, diagnósticos, exámenes y documentos.' })
  atencion(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.ficha.obtenerAtencion(actor, id);
  }

  @Patch('atenciones/:id')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Editar un borrador. Una atención cerrada responde 409.' })
  editarAtencion(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarAtencionDto) {
    return this.ficha.editarAtencion(actor, id, dto);
  }

  @Put('atenciones/:id/signos')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Guardar los signos vitales de un borrador (rangos amplios para atrapar errores de tipeo).' })
  signos(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: SignosVitalesDto) {
    return this.ficha.guardarSignos(actor, id, dto);
  }

  @Post('atenciones/:id/cerrar')
  @HttpCode(200)
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Cerrar la atención. Desde ahí es inmutable: solo admite enmiendas.' })
  cerrar(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.ficha.cerrarAtencion(actor, id);
  }

  @Post('atenciones/:id/enmiendas')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Agregar una corrección con motivo a una atención cerrada. El texto original sigue visible.' })
  enmienda(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EnmiendaDto) {
    return this.ficha.agregarEnmienda(actor, id, dto);
  }

  @Get('ficha/:pacienteId/signos')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Serie de signos vitales para graficar, con el IMC calculado.' })
  serieSignos(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number) {
    return this.ficha.serieSignos(actor, pacienteId);
  }

  // ── Diagnósticos ──

  @Get('ficha/:pacienteId/diagnosticos')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Lista de problemas del paciente.' })
  diagnosticos(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Query('estado') estado?: string) {
    return this.ficha.listarDiagnosticos(actor, pacienteId, estado);
  }

  @Post('ficha/:pacienteId/diagnosticos')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Registrar un diagnóstico (texto del médico; el código CIE-10 es opcional).' })
  crearDiagnostico(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Body() dto: CrearDiagnosticoDto) {
    return this.ficha.crearDiagnostico(actor, pacienteId, dto);
  }

  @Patch('diagnosticos/:id')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Marcar un diagnóstico como resuelto o descartado.' })
  editarDiagnostico(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarDiagnosticoDto) {
    return this.ficha.editarDiagnostico(actor, id, dto);
  }

  // ── Exámenes ──

  @Get('ficha/:pacienteId/examenes')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Exámenes solicitados y sus resultados.' })
  examenes(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Query('estado') estado?: string) {
    return this.ficha.listarExamenes(actor, pacienteId, estado);
  }

  @Post('ficha/:pacienteId/examenes')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Solicitar un examen.' })
  crearExamen(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number, @Body() dto: CrearExamenDto) {
    return this.ficha.crearExamen(actor, pacienteId, dto);
  }

  @Patch('examenes/:id')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Registrar el resultado (una sola vez) o anular un examen no realizado.' })
  editarExamen(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Body() dto: EditarExamenDto) {
    return this.ficha.editarExamen(actor, id, dto);
  }

  // ── Documentos ──

  @Get('ficha/:pacienteId/documentos')
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Documentos adjuntos del paciente.' })
  listarDocumentos(@CurrentUser() actor: UsuarioAutenticado, @Param('pacienteId', ParseIntPipe) pacienteId: number) {
    return this.documentos.listar(actor, pacienteId);
  }

  @Post('ficha/:pacienteId/documentos')
  @Roles(Rol.MEDICO)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO, files: 1 } }))
  @ApiOperation({ summary: 'Subir un documento (PDF, JPG o PNG de hasta 10 MB) en el campo "archivo".' })
  subir(
    @CurrentUser() actor: UsuarioAutenticado,
    @Param('pacienteId', ParseIntPipe) pacienteId: number,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() dto: SubirDocumentoDto,
  ) {
    return this.documentos.subir(actor, pacienteId, archivo, dto);
  }

  @Get('documentos/:id/archivo')
  @Roles(Rol.MEDICO, Rol.PACIENTE)
  @ApiOperation({ summary: 'Descargar un documento. Solo el paciente dueño o un médico con relación; verifica la huella del archivo.' })
  async archivo(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const { doc, contenido } = await this.documentos.descargar(actor, id);
    res.set({
      'Content-Type': doc.tipoMime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.nombreOriginal)}`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(contenido);
  }

  @Patch('documentos/:id/anular')
  @HttpCode(204)
  @Roles(Rol.MEDICO)
  @ApiOperation({ summary: 'Anular un documento propio. El archivo se conserva.' })
  anularDocumento(@CurrentUser() actor: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    return this.documentos.anular(actor, id);
  }
}
