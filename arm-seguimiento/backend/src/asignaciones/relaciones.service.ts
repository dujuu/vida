import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { armarPagina, desplazamiento, type PaginacionDto, type Pagina } from '../common/paginacion.js';
import { formatearRut } from '../common/rut.util.js';
import { Rol } from '../usuarios/rol.enum.js';
import { escaparLike } from '../usuarios/usuarios.service.js';
import { DoctorPaciente } from './doctor-paciente.entity.js';

/** Paciente de un médico, como aparece en su lista. Solo identificación; nada clínico. */
export interface PacienteDeMedico {
  id: number;
  nombre: string;
  rut: string;
  fechaNacimiento: string | null;
  relacionVigente: boolean;
  proximaCita: Date | null;
  indicacionesSinLeer: number;
}

/** Crea, cierra y consulta las relaciones de atención entre médicos y pacientes. */
@Injectable()
export class RelacionesService {
  constructor(
    @InjectRepository(DoctorPaciente) private readonly relaciones: Repository<DoctorPaciente>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Crea la relación entre un médico y un paciente, o la reabre si estaba cerrada. No hace nada si ya está vigente.
   *
   * @param manager Gestor de transacción, cuando se llama desde una reserva.
   */
  async asegurar(
    medicoId: number,
    pacienteId: number,
    origen: 'CITA' | 'MANUAL' | 'INICIAL',
    creadaPor: number | null,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(DoctorPaciente) : this.relaciones;
    const actual = await repo.findOneBy({ doctorId: medicoId, pacienteId });
    if (!actual) {
      await repo.insert({ doctorId: medicoId, pacienteId, origen, creadaPor, vigente: true });
    } else if (!actual.vigente) {
      await repo.update({ doctorId: medicoId, pacienteId }, { vigente: true, cerradaEn: null, motivoCierre: null });
    }
  }

  /** Lista los pacientes de un médico con búsqueda por nombre o RUT. */
  async pacientesDe(medicoId: number, buscar: string | undefined, incluirCerradas: boolean, pag: PaginacionDto): Promise<Pagina<PacienteDeMedico>> {
    const cond = ['dp.doctor_id = ?', 'u.activo = 1'];
    const params: unknown[] = [medicoId];
    if (!incluirCerradas) cond.push('dp.vigente = 1');
    if (buscar) {
      cond.push(`(CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno) LIKE ? OR u.rut LIKE ?)`);
      params.push(`%${escaparLike(buscar)}%`, `%${escaparLike(buscar.replace(/[.\-\s]/g, ''))}%`);
    }
    const where = cond.join(' AND ');
    const [{ total }] = await this.ds.query(
      `SELECT COUNT(*) AS total FROM doctor_paciente dp JOIN usuarios u ON u.id = dp.paciente_id WHERE ${where}`,
      params,
    );
    const filas = await this.ds.query(
      `SELECT u.id, u.rut, u.nombres, u.apellido_paterno AS ap, u.apellido_materno AS am, pp.fecha_nacimiento AS fechaNacimiento,
              dp.vigente,
              (SELECT MIN(c.inicio) FROM citas c WHERE c.paciente_id = u.id AND c.medico_id = dp.doctor_id
                 AND c.estado IN ('RESERVADA','EN_ESPERA') AND c.inicio > UTC_TIMESTAMP(6)) AS proximaCita,
              (SELECT COUNT(*) FROM recomendaciones r WHERE r.paciente_id = u.id AND r.doctor_id = dp.doctor_id
                 AND r.leida_at IS NULL AND r.estado = 'ACTIVA') AS sinLeer
       FROM doctor_paciente dp
       JOIN usuarios u ON u.id = dp.paciente_id
       LEFT JOIN perfil_paciente pp ON pp.usuario_id = u.id
       WHERE ${where} ORDER BY u.apellido_paterno, u.nombres LIMIT ? OFFSET ?`,
      [...params, pag.tamano, desplazamiento(pag)],
    );
    const items: PacienteDeMedico[] = filas.map((f: any) => ({
      id: f.id,
      nombre: [f.nombres, f.ap, f.am].filter((x: string | null) => !!x).join(' '),
      rut: formatearRut(f.rut),
      fechaNacimiento: f.fechaNacimiento instanceof Date ? f.fechaNacimiento.toISOString().slice(0, 10) : f.fechaNacimiento,
      relacionVigente: !!f.vigente,
      proximaCita: f.proximaCita,
      indicacionesSinLeer: Number(f.sinLeer),
    }));
    return armarPagina(items, Number(total), pag);
  }

  /** Médicos vinculados a un paciente (los ve recepción o administración). */
  async medicosDe(pacienteId: number) {
    const filas = await this.ds.query(
      `SELECT u.id, u.titulo, u.nombres, u.apellido_paterno AS ap, u.apellido_materno AS am, e.nombre AS especialidad,
              dp.vigente, dp.origen, dp.created_at AS desde, dp.cerrada_en AS cerradaEn, dp.motivo_cierre AS motivoCierre,
              (SELECT COUNT(*) FROM citas c WHERE c.medico_id = dp.doctor_id AND c.paciente_id = dp.paciente_id
                 AND c.estado IN ('RESERVADA', 'EN_ESPERA') AND c.inicio > UTC_TIMESTAMP(6)) AS citasPendientes
       FROM doctor_paciente dp JOIN usuarios u ON u.id = dp.doctor_id
       LEFT JOIN perfil_profesional p ON p.usuario_id = u.id LEFT JOIN especialidades e ON e.id = p.especialidad_id
       WHERE dp.paciente_id = ? ORDER BY dp.vigente DESC, u.apellido_paterno`,
      [pacienteId],
    );
    return filas.map((f: any) => ({
      id: f.id,
      nombre: [f.titulo, f.nombres, f.ap, f.am].filter((x: string | null) => !!x).join(' '),
      especialidad: f.especialidad,
      vigente: !!f.vigente,
      origen: f.origen,
      desde: f.desde,
      cerradaEn: f.cerradaEn,
      motivoCierre: f.motivoCierre,
      /** Citas futuras que siguen reservadas con este médico: recepción decide si las cancela. */
      citasPendientes: Number(f.citasPendientes),
    }));
  }

  /** Crea el vínculo a mano (recepción o administración). */
  async crearManual(actor: UsuarioAutenticado, medicoId: number, pacienteId: number): Promise<void> {
    if (medicoId === pacienteId) throw new BadRequestException('Un médico no puede ser su propio paciente');
    const [m] = await this.ds.query(`SELECT 1 AS ok FROM usuario_rol r JOIN usuarios u ON u.id = r.usuario_id WHERE r.usuario_id = ? AND r.rol = 'MEDICO' AND u.activo = 1`, [medicoId]);
    if (!m) throw new NotFoundException('Médico no encontrado');
    const [p] = await this.ds.query(`SELECT 1 AS ok FROM usuario_rol r JOIN usuarios u ON u.id = r.usuario_id WHERE r.usuario_id = ? AND r.rol = 'PACIENTE' AND u.activo = 1`, [pacienteId]);
    if (!p) throw new NotFoundException('Paciente no encontrado');
    await this.asegurar(medicoId, pacienteId, 'MANUAL', actor.id);
    await this.auditoria.registrar(actor, Accion.RELACION_CREAR, { recurso: 'relacion', recursoId: medicoId, pacienteId });
  }

  /**
   * Cierra la relación con un motivo (quitar al médico asignado). La puede cerrar recepción, el administrador o el propio médico.
   * No cancela las citas futuras: `medicosDe` informa cuántas quedan para que recepción decida.
   *
   * @throws NotFoundException si la relación no existe o el médico intenta cerrar la de otro.
   */
  async cerrar(actor: UsuarioAutenticado, medicoId: number, pacienteId: number, motivo: string): Promise<void> {
    if (actor.rol === Rol.MEDICO && actor.id !== medicoId) throw new NotFoundException('Relación no encontrada');
    const r = await this.relaciones.findOneBy({ doctorId: medicoId, pacienteId });
    if (!r || !r.vigente) throw new NotFoundException('Relación no encontrada');
    await this.relaciones.update({ doctorId: medicoId, pacienteId }, { vigente: false, cerradaEn: new Date(), motivoCierre: motivo });
    await this.auditoria.registrar(actor, Accion.RELACION_CERRAR, { recurso: 'relacion', recursoId: medicoId, pacienteId, detalle: motivo });
  }
}
