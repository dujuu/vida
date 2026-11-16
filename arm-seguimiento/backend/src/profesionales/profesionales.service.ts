import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { PerfilProfesionalDto } from '../usuarios/usuarios.dto.js';
import { Especialidad } from './profesionales.entities.js';

/** Médico como lo ve quien reserva: sin RUT ni datos de contacto. */
export interface ProfesionalPublico {
  id: number;
  nombre: string;
  especialidadId: number;
  especialidad: string;
  presentacion: string | null;
  duracionCitaMin: number;
  aceptaReservas: boolean;
}

/** Catálogo de especialidades y perfiles profesionales de los médicos. */
@Injectable()
export class ProfesionalesService {
  constructor(
    @InjectRepository(Especialidad) private readonly especialidades: Repository<Especialidad>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly usuarios: UsuariosService,
  ) {}

  /** Especialidades. Por defecto solo las activas. */
  listarEspecialidades(todas = false): Promise<Especialidad[]> {
    return this.especialidades.find({ where: todas ? {} : { activa: true }, order: { nombre: 'ASC' } });
  }

  /** Crea una especialidad. @throws ConflictException si el nombre ya existe. */
  async crearEspecialidad(actor: UsuarioAutenticado, nombre: string): Promise<Especialidad> {
    if (await this.especialidades.existsBy({ nombre })) throw new ConflictException('Ya existe una especialidad con ese nombre');
    const e = await this.especialidades.save(this.especialidades.create({ nombre, activa: true }));
    await this.auditoria.registrar(actor, Accion.PERFIL_PROFESIONAL, { recurso: 'especialidad', recursoId: e.id, detalle: `crear ${nombre}` });
    return e;
  }

  /** Renombra, activa o desactiva una especialidad. No se puede desactivar si tiene médicos activos. */
  async editarEspecialidad(actor: UsuarioAutenticado, id: number, cambios: { nombre?: string; activa?: boolean }): Promise<Especialidad> {
    const e = await this.especialidades.findOneBy({ id });
    if (!e) throw new NotFoundException('Especialidad no encontrada');
    if (cambios.nombre && cambios.nombre !== e.nombre && (await this.especialidades.existsBy({ nombre: cambios.nombre }))) {
      throw new ConflictException('Ya existe una especialidad con ese nombre');
    }
    if (cambios.activa === false && e.activa) {
      const [{ n }] = await this.ds.query(
        `SELECT COUNT(*) AS n FROM perfil_profesional p JOIN usuarios u ON u.id = p.usuario_id WHERE p.especialidad_id = ? AND u.activo = 1`,
        [id],
      );
      if (Number(n) > 0) throw new BadRequestException('La especialidad tiene médicos activos y no se puede desactivar');
    }
    await this.especialidades.update({ id }, { ...(cambios.nombre ? { nombre: cambios.nombre } : {}), ...(cambios.activa !== undefined ? { activa: cambios.activa } : {}) });
    await this.auditoria.registrar(actor, Accion.PERFIL_PROFESIONAL, { recurso: 'especialidad', recursoId: id, detalle: JSON.stringify(cambios) });
    return this.especialidades.findOneByOrFail({ id });
  }

  /** Médicos activos, con filtro opcional por especialidad. */
  async listar(especialidadId?: number): Promise<ProfesionalPublico[]> {
    const filas = await this.ds.query(
      `SELECT u.id, u.titulo, u.nombres, u.apellido_paterno AS ap, u.apellido_materno AS am,
              p.especialidad_id AS especialidadId, e.nombre AS especialidad, p.presentacion,
              p.duracion_cita_min AS duracionCitaMin, p.acepta_reservas AS aceptaReservas
       FROM usuarios u
       JOIN usuario_rol r ON r.usuario_id = u.id AND r.rol = 'MEDICO'
       JOIN perfil_profesional p ON p.usuario_id = u.id
       JOIN especialidades e ON e.id = p.especialidad_id
       WHERE u.activo = 1 ${especialidadId ? 'AND p.especialidad_id = ?' : ''}
       ORDER BY e.nombre, u.apellido_paterno, u.nombres`,
      especialidadId ? [especialidadId] : [],
    );
    return filas.map((f: any) => ({
      id: f.id,
      nombre: [f.titulo, f.nombres, f.ap, f.am].filter((x: string | null) => !!x).join(' '),
      especialidadId: f.especialidadId,
      especialidad: f.especialidad,
      presentacion: f.presentacion,
      duracionCitaMin: f.duracionCitaMin,
      aceptaReservas: !!f.aceptaReservas,
    }));
  }

  /** Perfil de un médico activo. @throws NotFoundException si no existe o no es médico. */
  async obtener(id: number): Promise<ProfesionalPublico & { registroProfesional: string | null }> {
    const lista = await this.listar();
    const p = lista.find((x) => x.id === id);
    if (!p) throw new NotFoundException('Profesional no encontrado');
    const [fila] = await this.ds.query('SELECT registro_profesional AS r FROM perfil_profesional WHERE usuario_id = ?', [id]);
    return { ...p, registroProfesional: fila?.r ?? null };
  }

  /** Edita el perfil profesional de un médico. */
  async editarPerfil(actor: UsuarioAutenticado, id: number, dto: PerfilProfesionalDto) {
    const [medico] = await this.ds.query(`SELECT 1 AS ok FROM usuario_rol WHERE usuario_id = ? AND rol = 'MEDICO'`, [id]);
    if (!medico) throw new NotFoundException('Profesional no encontrado');
    await this.ds.transaction((m) => this.usuarios.guardarPerfilProfesional(m, id, dto));
    await this.auditoria.registrar(actor, Accion.PERFIL_PROFESIONAL, { recurso: 'perfil_profesional', recursoId: id });
    return this.obtener(id);
  }
}
