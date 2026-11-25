import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ModoPauta } from '../recomendaciones/modo-pauta.enum.js';
import { Rol } from '../usuarios/rol.enum.js';
import type { CrearPlantillaDto, EditarPlantillaDto } from './plantillas.dto.js';

const COLUMNAS = `id, nombre, tipo, titulo, descripcion, medicamento, presentacion, dosis, via, modo,
  intervalo_horas AS intervaloHoras, duracion_dias AS duracionDias, activa`;

/**
 * Plantillas de indicaciones. Las crean y editan el administrador y el director médico. El médico las usa como
 * punto de partida: ningún campo queda bloqueado y siempre puede elegir «Otro» y escribir la indicación a mano.
 */
@Injectable()
export class PlantillasService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private normalizar<T>(filas: Array<Record<string, unknown>>): T[] {
    return filas.map((f) => ({ ...f, activa: Boolean(Number(f.activa)) })) as T[];
  }

  /** Plantillas para elegir al indicar (solo activas) o todas para administrarlas. */
  async listar(todas: boolean) {
    const filas = await this.ds.query(
      `SELECT ${COLUMNAS} FROM plantillas_indicacion ${todas ? '' : 'WHERE activa = 1'} ORDER BY tipo, nombre`,
    );
    return this.normalizar(filas);
  }

  /** Quien puede administrar: administrador o médico marcado como director. */
  private async exigirGestor(actor: UsuarioAutenticado): Promise<void> {
    if (actor.rol === Rol.ADMINISTRADOR) return;
    if (actor.rol === Rol.MEDICO) {
      const [f] = await this.ds.query(`SELECT es_director AS d FROM perfil_profesional WHERE usuario_id = ?`, [actor.id]);
      if (f && Number(f.d) === 1) return;
    }
    throw new ForbiddenException('Solo el administrador o el director médico pueden administrar las plantillas');
  }

  /** Indica si el usuario puede administrar plantillas (para mostrar la opción en el menú). */
  async puedeGestionar(actor: UsuarioAutenticado): Promise<{ puede: boolean }> {
    try {
      await this.exigirGestor(actor);
      return { puede: true };
    } catch {
      return { puede: false };
    }
  }

  private validar(dto: CrearPlantillaDto): void {
    if (dto.modo === ModoPauta.CADA_N_HORAS && !dto.intervaloHoras) {
      throw new BadRequestException('Indique cada cuántas horas se repite');
    }
    if (dto.modo && !dto.duracionDias) throw new BadRequestException('Indique la duración en días');
  }

  async crear(actor: UsuarioAutenticado, dto: CrearPlantillaDto) {
    await this.exigirGestor(actor);
    this.validar(dto);
    try {
      const r = await this.ds.query(
        `INSERT INTO plantillas_indicacion (nombre, tipo, titulo, descripcion, medicamento, presentacion, dosis, via, modo, intervalo_horas, duracion_dias, creada_por)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [dto.nombre, dto.tipo, dto.titulo, dto.descripcion, dto.medicamento ?? null, dto.presentacion ?? null, dto.dosis ?? null,
          dto.via ?? null, dto.modo ?? null, dto.intervaloHoras ?? null, dto.duracionDias ?? null, actor.id],
      );
      await this.auditoria.registrar(actor, Accion.PLANTILLA_CREAR, { recurso: 'plantilla', recursoId: r.insertId, detalle: dto.nombre });
      return { id: Number(r.insertId) };
    } catch (e) {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') throw new ConflictException('Ya existe una plantilla con ese nombre');
      throw e;
    }
  }

  async editar(actor: UsuarioAutenticado, id: number, dto: EditarPlantillaDto) {
    await this.exigirGestor(actor);
    this.validar(dto);
    try {
      const r = await this.ds.query(
        `UPDATE plantillas_indicacion SET nombre=?, tipo=?, titulo=?, descripcion=?, medicamento=?, presentacion=?, dosis=?, via=?,
           modo=?, intervalo_horas=?, duracion_dias=?, activa=COALESCE(?, activa), updated_at=UTC_TIMESTAMP(6) WHERE id=?`,
        [dto.nombre, dto.tipo, dto.titulo, dto.descripcion, dto.medicamento ?? null, dto.presentacion ?? null, dto.dosis ?? null,
          dto.via ?? null, dto.modo ?? null, dto.intervaloHoras ?? null, dto.duracionDias ?? null,
          dto.activa === undefined ? null : dto.activa ? 1 : 0, id],
      );
      if (!r.affectedRows) throw new NotFoundException('La plantilla no existe');
      await this.auditoria.registrar(actor, Accion.PLANTILLA_EDITAR, { recurso: 'plantilla', recursoId: id, detalle: dto.nombre });
    } catch (e) {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') throw new ConflictException('Ya existe una plantilla con ese nombre');
      throw e;
    }
  }

  /** Médicos con su marca de director. Solo el administrador designa directores. */
  async medicos() {
    const filas = await this.ds.query(
      `SELECT u.id, CONCAT(COALESCE(u.titulo,''), ' ', u.nombres, ' ', u.apellido_paterno) AS nombre, e.nombre AS especialidad, p.es_director AS esDirector
       FROM perfil_profesional p JOIN usuarios u ON u.id = p.usuario_id JOIN especialidades e ON e.id = p.especialidad_id
       ORDER BY u.apellido_paterno`,
    );
    return filas.map((f: Record<string, unknown>) => ({ ...f, nombre: String(f.nombre).trim(), esDirector: Boolean(Number(f.esDirector)) }));
  }

  async marcarDirector(actor: UsuarioAutenticado, medicoId: number, esDirector: boolean) {
    const r = await this.ds.query(`UPDATE perfil_profesional SET es_director = ? WHERE usuario_id = ?`, [esDirector ? 1 : 0, medicoId]);
    if (!r.affectedRows) throw new NotFoundException('El médico no existe');
    await this.auditoria.registrar(actor, Accion.DIRECTOR_CAMBIAR, { recurso: 'medico', recursoId: medicoId, detalle: esDirector ? 'designado' : 'retirado' });
  }
}
