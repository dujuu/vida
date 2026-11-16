import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsObject } from 'class-validator';
import { statfs, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { CurrentUser, Public, Roles } from '../auth/decorators.js';
import { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../usuarios/rol.enum.js';
import { ConfiguracionService } from './configuracion.service.js';

/** Cuerpo de la actualización de parámetros: `{ valores: { clave: valor } }`. */
export class ActualizarConfiguracionDto {
  @IsObject({ message: 'Envíe los valores como un objeto' })
  valores: Record<string, string | number | boolean>;
}

/** Parámetros del sistema, métricas de uso y estado del servidor. */
@ApiTags('Configuración')
@Controller()
export class ConfiguracionController {
  constructor(
    private readonly config: ConfiguracionService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  @Public()
  @Get('configuracion/publica')
  @ApiOperation({ summary: 'Nombre del centro y si la Clave Única simulada está activa (sin sesión).' })
  publica() {
    return this.config.publica();
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR)
  @Get('configuracion')
  @ApiOperation({ summary: 'Todos los parámetros del sistema.' })
  listar() {
    return this.config.listar();
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR)
  @Put('configuracion')
  @ApiOperation({ summary: 'Cambiar parámetros, con validación de rango y auditoría.' })
  actualizar(@CurrentUser() actor: UsuarioAutenticado, @Body() dto: ActualizarConfiguracionDto) {
    return this.config.actualizar(actor, dto.valores);
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR)
  @Get('metricas')
  @ApiOperation({ summary: 'Conteos operativos de uso. No toca tablas clínicas.' })
  async metricas() {
    const porRol = await this.ds.query(
      `SELECT ur.rol, COUNT(*) AS cantidad FROM usuario_rol ur JOIN usuarios u ON u.id = ur.usuario_id WHERE u.activo = 1 GROUP BY ur.rol`,
    );
    const [{ sesiones }] = await this.ds.query(
      `SELECT COUNT(DISTINCT usuario_id) AS sesiones FROM sesiones WHERE ultimo_uso >= (UTC_TIMESTAMP(6) - INTERVAL 1 DAY) AND revocada_en IS NULL`,
    );
    const citasPorEstado = await this.ds.query(`SELECT estado, COUNT(*) AS cantidad FROM citas GROUP BY estado`);
    const reservasPorCanal = await this.ds.query(`SELECT canal, COUNT(*) AS cantidad FROM citas GROUP BY canal`);
    const contactosPorMedio = await this.ds.query(`SELECT medio, COUNT(*) AS cantidad FROM contactos GROUP BY medio`);
    return {
      usuariosActivosPorRol: porRol.map((r: any) => ({ rol: r.rol, cantidad: Number(r.cantidad) })),
      usuariosConSesionHoy: Number(sesiones),
      citasPorEstado: citasPorEstado.map((r: any) => ({ estado: r.estado, cantidad: Number(r.cantidad) })),
      reservasPorCanal: reservasPorCanal.map((r: any) => ({ canal: r.canal, cantidad: Number(r.cantidad) })),
      contactosPorMedio: contactosPorMedio.map((r: any) => ({ medio: r.medio, cantidad: Number(r.cantidad) })),
    };
  }

  @ApiBearerAuth()
  @Roles(Rol.ADMINISTRADOR)
  @Get('estado')
  @ApiOperation({ summary: 'Versión, migraciones, último respaldo y espacio en disco.' })
  async estado() {
    const [{ migraciones }] = await this.ds.query(`SELECT COUNT(*) AS migraciones FROM migrations`);
    let ultimoRespaldo: string | null = null;
    const carpeta = process.env.RESPALDOS_DIR;
    if (carpeta) {
      try {
        const archivos = await readdir(carpeta);
        let max = 0;
        for (const a of archivos) max = Math.max(max, (await stat(join(carpeta, a))).mtimeMs);
        ultimoRespaldo = max > 0 ? new Date(max).toISOString() : null;
      } catch {
        ultimoRespaldo = null;
      }
    }
    let disco: { libreMb: number; totalMb: number } | null = null;
    try {
      const s = await statfs(process.env.ARCHIVOS_DIR ?? '.');
      disco = { libreMb: Math.round((s.bavail * s.bsize) / 1048576), totalMb: Math.round((s.blocks * s.bsize) / 1048576) };
    } catch {
      disco = null;
    }
    return {
      version: process.env.npm_package_version ?? '0.0.1',
      modo: process.env.MODO ?? 'desarrollo',
      migracionesAplicadas: Number(migraciones),
      ultimoRespaldo,
      disco,
    };
  }
}
