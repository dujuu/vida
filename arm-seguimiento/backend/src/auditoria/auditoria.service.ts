import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { contextoActual } from '../common/contexto.js';
import { armarPagina, desplazamiento, type Pagina } from '../common/paginacion.js';
import type { FiltroAuditoriaDto } from './auditoria.dto.js';
import { Auditoria } from './auditoria.entity.js';

/** Catálogo de acciones auditadas. */
export const Accion = {
  LOGIN_OK: 'LOGIN_OK',
  LOGIN_FALLIDO: 'LOGIN_FALLIDO',
  LOGIN_BLOQUEADO: 'LOGIN_BLOQUEADO',
  LOGOUT: 'LOGOUT',
  CAMBIO_ROL: 'CAMBIO_ROL',
  ACTIVACION: 'ACTIVACION',
  CAMBIO_PASSWORD: 'CAMBIO_PASSWORD',
  SESION_REVOCADA: 'SESION_REVOCADA',
  CLAVE_UNICA_SIMULADA: 'CLAVE_UNICA_SIMULADA',
  USUARIO_CREAR: 'USUARIO_CREAR',
  USUARIO_EDITAR: 'USUARIO_EDITAR',
  USUARIO_ROLES: 'USUARIO_ROLES',
  USUARIO_ESTADO: 'USUARIO_ESTADO',
  CODIGO_EMITIR: 'CODIGO_EMITIR',
  PACIENTE_CREAR: 'PACIENTE_CREAR',
  PACIENTE_EDITAR: 'PACIENTE_EDITAR',
  PACIENTE_LEER: 'PACIENTE_LEER',
  PACIENTE_FUSIONAR: 'PACIENTE_FUSIONAR',
  PERFIL_PROFESIONAL: 'PERFIL_PROFESIONAL',
  PLANTILLA_CREAR: 'PLANTILLA_CREAR',
  PLANTILLA_EDITAR: 'PLANTILLA_EDITAR',
  DIRECTOR_CAMBIAR: 'DIRECTOR_CAMBIAR',
  RELACION_CREAR: 'RELACION_CREAR',
  RELACION_CERRAR: 'RELACION_CERRAR',
  AGENDA_EDITAR: 'AGENDA_EDITAR',
  CITA_RESERVAR: 'CITA_RESERVAR',
  CITA_CANCELAR: 'CITA_CANCELAR',
  CITA_REPROGRAMAR: 'CITA_REPROGRAMAR',
  CITA_ESTADO: 'CITA_ESTADO',
  CONTACTO_CREAR: 'CONTACTO_CREAR',
  CONTACTO_EDITAR: 'CONTACTO_EDITAR',
  FICHA_LEER: 'FICHA_LEER',
  FICHA_ESCRIBIR: 'FICHA_ESCRIBIR',
  FICHA_EXPORTAR: 'FICHA_EXPORTAR',
  DOCUMENTO_DESCARGAR: 'DOCUMENTO_DESCARGAR',
  INDICACION_LEER: 'INDICACION_LEER',
  INDICACION_ESCRIBIR: 'INDICACION_ESCRIBIR',
  TOMA_MARCAR: 'TOMA_MARCAR',
  SEGUIMIENTO_LEER: 'SEGUIMIENTO_LEER',
  CONFIGURACION_EDITAR: 'CONFIGURACION_EDITAR',
  AUDITORIA_CONSULTAR: 'AUDITORIA_CONSULTAR',
  ACCESO_DENEGADO: 'ACCESO_DENEGADO',
} as const;

/** Datos de un evento de auditoría. */
export interface DatosAuditoria {
  recurso?: string;
  recursoId?: string | number | null;
  pacienteId?: number | null;
  resultado?: 'PERMITIDO' | 'DENEGADO' | 'ERROR';
  /** Texto técnico breve. Nunca debe contener contenido clínico. */
  detalle?: string | null;
}

/** Fila de auditoría lista para mostrar. */
export interface FilaAuditoria {
  id: string;
  fecha: Date;
  usuarioId: number | null;
  usuario: string | null;
  rol: string | null;
  accion: string;
  recurso: string | null;
  recursoId: string | null;
  pacienteId: number | null;
  paciente: string | null;
  resultado: string;
  ip: string | null;
  detalle: string | null;
}

/**
 * Escribe y consulta la auditoría. Solo inserta: la base de datos impide modificar o borrar filas.
 * Guarda identificadores, nunca contenido clínico.
 */
@Injectable()
export class AuditoriaService {
  constructor(@InjectRepository(Auditoria) private readonly repo: Repository<Auditoria>) {}

  /**
   * Registra un evento. Si falla, la excepción llega al llamador: una lectura clínica no se entrega si no
   * se pudo auditar.
   *
   * @param actor Usuario que actúa, o `null` si no hay sesión (por ejemplo, un login fallido).
   * @param accion Una de las acciones de {@link Accion}.
   * @param datos Recurso afectado, paciente y detalle.
   * @param manager Gestor de transacción, para auditar dentro de la misma operación.
   */
  async registrar(
    actor: Pick<UsuarioAutenticado, 'id' | 'rol'> | null,
    accion: string,
    datos: DatosAuditoria = {},
    manager?: EntityManager,
  ): Promise<void> {
    const ctx = contextoActual();
    const repo = manager ? manager.getRepository(Auditoria) : this.repo;
    await repo.insert({
      usuarioId: actor?.id ?? null,
      rol: actor?.rol ?? null,
      accion,
      recurso: datos.recurso ?? null,
      recursoId: datos.recursoId === undefined || datos.recursoId === null ? null : String(datos.recursoId),
      pacienteId: datos.pacienteId ?? null,
      resultado: datos.resultado ?? 'PERMITIDO',
      ip: ctx.ip,
      agente: ctx.agente,
      detalle: datos.detalle ? datos.detalle.slice(0, 300) : null,
    });
  }

  /** Condiciones SQL y parámetros de un filtro. */
  private condiciones(f: FiltroAuditoriaDto): { where: string; params: unknown[] } {
    const c: string[] = ['1 = 1'];
    const p: unknown[] = [];
    if (f.usuario) (c.push('a.usuario_id = ?'), p.push(f.usuario));
    if (f.paciente) (c.push('a.paciente_id = ?'), p.push(f.paciente));
    if (f.accion) (c.push('a.accion = ?'), p.push(f.accion));
    if (f.resultado) (c.push('a.resultado = ?'), p.push(f.resultado));
    if (f.desde) (c.push('a.fecha >= ?'), p.push(new Date(f.desde)));
    if (f.hasta) (c.push('a.fecha < ?'), p.push(new Date(new Date(f.hasta).getTime() + 86_400_000)));
    return { where: c.join(' AND '), params: p };
  }

  private static readonly SELECT = `
    SELECT a.id, a.fecha, a.usuario_id AS usuarioId,
           TRIM(CONCAT_WS(' ', u.titulo, u.nombres, u.apellido_paterno)) AS usuario,
           a.rol, a.accion, a.recurso, a.recurso_id AS recursoId, a.paciente_id AS pacienteId,
           TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno)) AS paciente,
           a.resultado, a.ip, a.detalle
    FROM auditoria a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    LEFT JOIN usuarios p ON p.id = a.paciente_id`;

  /** Lista eventos con filtros, del más reciente al más antiguo. */
  async listar(f: FiltroAuditoriaDto): Promise<Pagina<FilaAuditoria>> {
    const { where, params } = this.condiciones(f);
    const [{ total }] = await this.repo.query(`SELECT COUNT(*) AS total FROM auditoria a WHERE ${where}`, params);
    const filas: FilaAuditoria[] = await this.repo.query(
      `${AuditoriaService.SELECT} WHERE ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, f.tamano, desplazamiento(f)],
    );
    return armarPagina(filas, Number(total), f);
  }

  /** Genera el resultado filtrado como CSV (hasta 10.000 filas). */
  async exportarCsv(f: FiltroAuditoriaDto): Promise<string> {
    const { where, params } = this.condiciones(f);
    const filas: FilaAuditoria[] = await this.repo.query(
      `${AuditoriaService.SELECT} WHERE ${where} ORDER BY a.id DESC LIMIT 10000`,
      params,
    );
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cabecera = ['fecha', 'usuario', 'rol', 'accion', 'recurso', 'recurso_id', 'paciente', 'resultado', 'ip', 'detalle'];
    const lineas = filas.map((r) =>
      [r.fecha instanceof Date ? r.fecha.toISOString() : r.fecha, r.usuario, r.rol, r.accion, r.recurso, r.recursoId, r.paciente, r.resultado, r.ip, r.detalle]
        .map(celda)
        .join(','),
    );
    return [cabecera.join(','), ...lineas].join('\n');
  }

  /** Accesos de otras personas a la ficha de un paciente, para que él los consulte. */
  async accesosAPaciente(pacienteId: number, f: FiltroAuditoriaDto): Promise<Pagina<Pick<FilaAuditoria, 'fecha' | 'usuario' | 'rol' | 'accion'>>> {
    const acciones = [Accion.FICHA_LEER, Accion.FICHA_ESCRIBIR, Accion.FICHA_EXPORTAR, Accion.DOCUMENTO_DESCARGAR, Accion.INDICACION_LEER];
    const marcas = acciones.map(() => '?').join(',');
    const base = `FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.paciente_id = ? AND a.resultado = 'PERMITIDO' AND a.accion IN (${marcas}) AND (a.usuario_id IS NULL OR a.usuario_id <> ?)`;
    const params = [pacienteId, ...acciones, pacienteId];
    const [{ total }] = await this.repo.query(`SELECT COUNT(*) AS total ${base}`, params);
    const filas = await this.repo.query(
      `SELECT a.fecha, TRIM(CONCAT_WS(' ', u.titulo, u.nombres, u.apellido_paterno)) AS usuario, a.rol, a.accion ${base}
       ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, f.tamano, desplazamiento(f)],
    );
    return armarPagina(filas, Number(total), f);
  }
}
