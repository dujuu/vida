import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AgendaService } from '../agenda/agenda.service.js';
import { RelacionesService } from '../asignaciones/relaciones.service.js';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { hoyLocal, inicioDiaUtc, sumarDias, utcALocal } from '../common/fechas.util.js';
import { armarPagina, desplazamiento, type Pagina } from '../common/paginacion.js';
import { formatearRut } from '../common/rut.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { Rol } from '../usuarios/rol.enum.js';
import type { CancelarCitaDto, FiltroCitasDto, FiltroMisCitasDto, FinalizarCitaDto, ReservarCitaDto } from './citas.dto.js';
import { CanalCita, Cita, CitaHistorial, EstadoCita, TipoCita } from './citas.entities.js';
import { transicionValida } from './citas.util.js';

/** Cita lista para mostrar. */
export interface CitaVista {
  id: number;
  inicio: Date;
  fin: Date;
  estado: EstadoCita;
  tipo: TipoCita;
  canal: CanalCita;
  llegadaEn: Date | null;
  atendidaEn: Date | null;
  /** Nota administrativa. No la ve el administrador. */
  nota: string | null;
  motivoCancelacion: string | null;
  reprogramadaDesde: number | null;
  medico: { id: number; nombre: string; especialidad: string | null };
  paciente: { id: number; nombre: string; rut: string };
  /** Solo en la agenda del médico: atención clínica ligada a la cita. */
  atencion?: { id: number; estado: string } | null;
}

const SELECT = `
  SELECT c.id, c.inicio, c.fin, c.estado, c.tipo, c.canal, c.llegada_en AS llegadaEn, c.atendida_en AS atendidaEn, c.nota,
         c.motivo_cancelacion AS motivoCancelacion, c.reprogramada_desde AS reprogramadaDesde,
         m.id AS medicoId, TRIM(CONCAT_WS(' ', m.titulo, m.nombres, m.apellido_paterno)) AS medico, e.nombre AS especialidad,
         p.id AS pacienteId, TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)) AS paciente, p.rut AS rutPaciente
  FROM citas c
  JOIN usuarios m ON m.id = c.medico_id
  LEFT JOIN perfil_profesional pp ON pp.usuario_id = m.id
  LEFT JOIN especialidades e ON e.id = pp.especialidad_id
  JOIN usuarios p ON p.id = c.paciente_id`;

/** Citas médicas: reservar, cancelar, reprogramar y llevar el estado durante el día. */
@Injectable()
export class CitasService {
  constructor(
    @InjectRepository(Cita) private readonly citas: Repository<Cita>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly agenda: AgendaService,
    private readonly relaciones: RelacionesService,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ───────────────────────── Utilidades ─────────────────────────

  private aVista(f: any, verNota: boolean): CitaVista {
    return {
      id: f.id,
      inicio: new Date(f.inicio),
      fin: new Date(f.fin),
      estado: f.estado,
      tipo: f.tipo,
      canal: f.canal,
      llegadaEn: f.llegadaEn,
      atendidaEn: f.atendidaEn,
      nota: verNota ? f.nota : null,
      motivoCancelacion: f.motivoCancelacion,
      reprogramadaDesde: f.reprogramadaDesde,
      medico: { id: f.medicoId, nombre: f.medico, especialidad: f.especialidad },
      paciente: { id: f.pacienteId, nombre: f.paciente, rut: formatearRut(f.rutPaciente) },
      ...(f.atencionId !== undefined ? { atencion: f.atencionId ? { id: f.atencionId, estado: f.atencionEstado } : null } : {}),
    };
  }

  private async cargar(id: number, m?: EntityManager): Promise<Cita> {
    const c = await (m ? m.getRepository(Cita) : this.citas).findOneBy({ id });
    if (!c) throw new NotFoundException('Cita no encontrada');
    return c;
  }

  /** Un recurso ajeno responde 404, como en el resto del sistema. */
  private verificarAcceso(actor: UsuarioAutenticado, c: Cita): void {
    const ok =
      actor.rol === Rol.RECEPCIONISTA ||
      actor.rol === Rol.ADMINISTRADOR ||
      (actor.rol === Rol.PACIENTE && c.pacienteId === actor.id) ||
      (actor.rol === Rol.MEDICO && c.medicoId === actor.id);
    if (!ok) throw new NotFoundException('Cita no encontrada');
  }

  private mapearDuplicado(e: any): unknown {
    const d = e?.driverError ?? e;
    if (d?.code === 'ER_DUP_ENTRY' || d?.errno === 1062) {
      const msg = String(d.sqlMessage ?? d.message ?? '');
      if (msg.includes('uq_cita_paciente_slot')) {
        return new ConflictException({ statusCode: 409, message: 'El paciente ya tiene una cita a esa hora', codigo: 'PACIENTE_OCUPADO' });
      }
      return new ConflictException({ statusCode: 409, message: 'Esa hora ya no está disponible', codigo: 'HORA_NO_DISPONIBLE' });
    }
    return e;
  }

  private async exigirPaciente(id: number): Promise<void> {
    const [f] = await this.ds.query(
      `SELECT 1 AS ok FROM usuarios u JOIN usuario_rol r ON r.usuario_id = u.id AND r.rol = 'PACIENTE' WHERE u.id = ? AND u.activo = 1`,
      [id],
    );
    if (!f) throw new NotFoundException('Paciente no encontrado');
  }

  private async registrarCambio(m: EntityManager, citaId: number, anterior: string | null, nuevo: string, usuarioId: number): Promise<void> {
    await m.insert(CitaHistorial, { citaId, estadoAnterior: anterior, estadoNuevo: nuevo, usuarioId });
  }

  /** Avisa a la otra parte cuando el cambio lo hizo una tercera persona. */
  private async avisar(c: Cita, actor: UsuarioAutenticado, tipo: string, titulo: string, texto: string): Promise<void> {
    if (actor.id !== c.pacienteId) await this.notificaciones.crear(c.pacienteId, tipo, titulo, texto, '/paciente/horas');
    if (actor.id !== c.medicoId) await this.notificaciones.crear(c.medicoId, tipo, titulo, texto, '/medico/agenda');
  }

  private async exigirPlazoPaciente(actor: UsuarioAutenticado, c: Cita): Promise<void> {
    if (actor.rol !== Rol.PACIENTE) return;
    const horas = await this.config.numero('cancelacion_horas');
    if (c.inicio.getTime() - Date.now() < horas * 3_600_000) {
      throw new BadRequestException(`Puede cancelar o reprogramar hasta ${horas} horas antes de la cita. Comuníquese con recepción.`);
    }
  }

  // ───────────────────────── Reservar ─────────────────────────

  /**
   * Reserva una hora. El paciente reserva para sí mismo; recepción, para cualquiera.
   *
   * La doble reserva la impide la base de datos: dos restricciones únicas (médico y hora, paciente y hora) sobre
   * `slot_activo`. Si dos personas confirman la misma hora, una inserción falla y esa persona recibe un 409.
   *
   * @throws ConflictException (409) si la hora ya no está disponible.
   */
  async reservar(actor: UsuarioAutenticado, dto: ReservarCitaDto): Promise<CitaVista> {
    const esPaciente = actor.rol === Rol.PACIENTE;
    let pacienteId: number;
    if (esPaciente) {
      if (dto.pacienteId && dto.pacienteId !== actor.id) throw new ForbiddenException('Solo puede reservar horas para usted');
      pacienteId = actor.id;
    } else {
      if (!dto.pacienteId) throw new BadRequestException('Seleccione un paciente');
      pacienteId = dto.pacienteId;
    }
    if (dto.medicoId === pacienteId) throw new BadRequestException('Un médico no puede reservar una hora consigo mismo');
    await this.exigirPaciente(pacienteId);
    const inicio = new Date(dto.inicio);
    const { fin } = await this.agenda.validarHora(dto.medicoId, inicio, esPaciente);

    if (esPaciente) {
      const max = await this.config.numero('citas_futuras_max');
      const [{ n }] = await this.ds.query(
        `SELECT COUNT(*) AS n FROM citas WHERE paciente_id = ? AND estado IN ('RESERVADA','EN_ESPERA') AND inicio > UTC_TIMESTAMP(6)`,
        [pacienteId],
      );
      if (Number(n) >= max) throw new BadRequestException(`Ya tiene ${max} citas futuras. Cancele una o llame a recepción.`);
    }

    const cita = await this.ds
      .transaction(async (m) => {
        let tipo = dto.tipo;
        if (!tipo) {
          const [{ n }] = await m.query(`SELECT COUNT(*) AS n FROM citas WHERE paciente_id = ? AND medico_id = ? AND estado = 'ATENDIDA'`, [pacienteId, dto.medicoId]);
          tipo = Number(n) > 0 ? TipoCita.CONTROL : TipoCita.PRIMERA_VEZ;
        }
        const c = await m.save(
          m.create(Cita, {
            medicoId: dto.medicoId,
            pacienteId,
            inicio,
            fin,
            estado: EstadoCita.RESERVADA,
            tipo,
            canal: esPaciente ? CanalCita.APP : (dto.canal ?? CanalCita.MESON),
            creadaPor: actor.id,
            nota: dto.nota ?? null,
            slotActivo: inicio,
          }),
        );
        await this.relaciones.asegurar(dto.medicoId, pacienteId, 'CITA', actor.id, m);
        await this.registrarCambio(m, c.id, null, EstadoCita.RESERVADA, actor.id);
        await this.auditoria.registrar(actor, Accion.CITA_RESERVAR, { recurso: 'cita', recursoId: c.id, pacienteId }, m);
        return c;
      })
      .catch((e) => {
        throw this.mapearDuplicado(e);
      });
    await this.avisar(cita, actor, 'CITA_RESERVADA', 'Nueva cita', 'Se reservó una hora. Revise los detalles en su agenda.');
    return this.vista(actor, cita.id);
  }

  // ───────────────────────── Cancelar y reprogramar ─────────────────────────

  /** Cancela una cita reservada. El paciente puede hacerlo hasta el plazo configurado; recepción, siempre. */
  async cancelar(actor: UsuarioAutenticado, id: number, dto: CancelarCitaDto): Promise<CitaVista> {
    const c = await this.cargar(id);
    this.verificarAcceso(actor, c);
    if (actor.rol === Rol.MEDICO) throw new ForbiddenException('Un médico no cancela citas: pida a recepción que la reprograme');
    if (c.estado !== EstadoCita.RESERVADA) throw new BadRequestException('Solo se puede cancelar una cita reservada');
    await this.exigirPlazoPaciente(actor, c);
    await this.ds.transaction(async (m) => {
      const r = await m.update(Cita, { id, estado: EstadoCita.RESERVADA }, {
        estado: EstadoCita.CANCELADA,
        slotActivo: null,
        canceladaEn: new Date(),
        canceladaPor: actor.id,
        motivoCancelacion: dto.motivo,
      });
      if (r.affected !== 1) throw new ConflictException('La cita cambió de estado. Actualice e intente de nuevo.');
      await this.registrarCambio(m, id, EstadoCita.RESERVADA, EstadoCita.CANCELADA, actor.id);
      await this.auditoria.registrar(actor, Accion.CITA_CANCELAR, { recurso: 'cita', recursoId: id, pacienteId: c.pacienteId }, m);
    });
    await this.avisar(c, actor, 'CITA_CANCELADA', 'Cita cancelada', 'Se canceló una cita. Revise su agenda.');
    return this.vista(actor, id);
  }

  /**
   * Cambia la hora de una cita con el mismo médico: cancela la actual y reserva la nueva en una sola operación.
   * Si la hora nueva ya no está disponible, la cita original queda intacta.
   */
  async reprogramar(actor: UsuarioAutenticado, id: number, inicioNuevo: string): Promise<CitaVista> {
    const c = await this.cargar(id);
    this.verificarAcceso(actor, c);
    if (actor.rol === Rol.MEDICO) throw new ForbiddenException('Un médico no reprograma citas: pida a recepción que lo haga');
    if (c.estado !== EstadoCita.RESERVADA) throw new BadRequestException('Solo se puede reprogramar una cita reservada');
    await this.exigirPlazoPaciente(actor, c);
    const inicio = new Date(inicioNuevo);
    if (inicio.getTime() === c.inicio.getTime()) throw new BadRequestException('La hora nueva es igual a la actual');
    const esPaciente = actor.rol === Rol.PACIENTE;
    const { fin } = await this.agenda.validarHora(c.medicoId, inicio, esPaciente);

    const nueva = await this.ds
      .transaction(async (m) => {
        const r = await m.update(Cita, { id, estado: EstadoCita.RESERVADA }, {
          estado: EstadoCita.CANCELADA,
          slotActivo: null,
          canceladaEn: new Date(),
          canceladaPor: actor.id,
          motivoCancelacion: 'Reprogramada',
        });
        if (r.affected !== 1) throw new ConflictException('La cita cambió de estado. Actualice e intente de nuevo.');
        const n = await m.save(
          m.create(Cita, {
            medicoId: c.medicoId,
            pacienteId: c.pacienteId,
            inicio,
            fin,
            estado: EstadoCita.RESERVADA,
            tipo: c.tipo,
            canal: esPaciente ? CanalCita.APP : CanalCita.MESON,
            creadaPor: actor.id,
            reprogramadaDesde: id,
            nota: c.nota,
            slotActivo: inicio,
          }),
        );
        await this.registrarCambio(m, id, EstadoCita.RESERVADA, EstadoCita.CANCELADA, actor.id);
        await this.registrarCambio(m, n.id, null, EstadoCita.RESERVADA, actor.id);
        await this.auditoria.registrar(actor, Accion.CITA_REPROGRAMAR, { recurso: 'cita', recursoId: n.id, pacienteId: c.pacienteId, detalle: `desde ${id}` }, m);
        return n;
      })
      .catch((e) => {
        throw this.mapearDuplicado(e);
      });
    await this.avisar(nueva, actor, 'CITA_REPROGRAMADA', 'Cita reprogramada', 'Se cambió la hora de una cita. Revise su agenda.');
    return this.vista(actor, nueva.id);
  }

  // ───────────────────────── Estados del día ─────────────────────────

  /** Cambia el estado de una cita validando la transición y dejando historial y auditoría. */
  private async cambiarEstado(actor: UsuarioAutenticado, c: Cita, nuevo: EstadoCita, extra: Partial<Cita> = {}): Promise<void> {
    if (!transicionValida(c.estado, nuevo)) throw new BadRequestException(`No se puede pasar una cita de ${c.estado} a ${nuevo}`);
    await this.ds.transaction(async (m) => {
      const r = await m.update(Cita, { id: c.id, estado: c.estado }, { estado: nuevo, ...extra });
      if (r.affected !== 1) throw new ConflictException('La cita cambió de estado. Actualice e intente de nuevo.');
      await this.registrarCambio(m, c.id, c.estado, nuevo, actor.id);
      await this.auditoria.registrar(actor, Accion.CITA_ESTADO, { recurso: 'cita', recursoId: c.id, pacienteId: c.pacienteId, detalle: `${c.estado} -> ${nuevo}` }, m);
    });
  }

  /** Registra la llegada del paciente. Solo el día de la cita. */
  async llegada(actor: UsuarioAutenticado, id: number): Promise<CitaVista> {
    const c = await this.cargar(id);
    if (utcALocal(c.inicio).fecha !== hoyLocal()) throw new BadRequestException('Solo se puede registrar la llegada el día de la cita');
    await this.cambiarEstado(actor, c, EstadoCita.EN_ESPERA, { llegadaEn: new Date() });
    await this.notificaciones.crear(c.medicoId, 'PACIENTE_EN_ESPERA', 'Paciente en espera', 'Un paciente registró su llegada.', '/medico/agenda');
    return this.vista(actor, id);
  }

  /** El médico inicia la atención de una cita propia. */
  async iniciar(actor: UsuarioAutenticado, id: number): Promise<CitaVista> {
    const c = await this.cargar(id);
    if (c.medicoId !== actor.id) throw new NotFoundException('Cita no encontrada');
    await this.cambiarEstado(actor, c, EstadoCita.EN_ATENCION);
    return this.vista(actor, id);
  }

  /** El médico cierra la atención. Exige una atención clínica cerrada o la declaración de que no hubo. */
  async finalizar(actor: UsuarioAutenticado, id: number, dto: FinalizarCitaDto): Promise<CitaVista> {
    const c = await this.cargar(id);
    if (c.medicoId !== actor.id) throw new NotFoundException('Cita no encontrada');
    const [cerrada] = await this.ds.query(`SELECT 1 AS ok FROM atenciones WHERE cita_id = ? AND estado = 'CERRADA'`, [id]);
    if (!cerrada && dto.sinAtencion !== true) {
      throw new ConflictException({ statusCode: 409, message: 'Cierre la atención clínica o indique que no registró una atención.', codigo: 'ATENCION_PENDIENTE' });
    }
    await this.cambiarEstado(actor, c, EstadoCita.ATENDIDA, { atendidaEn: new Date() });
    return this.vista(actor, id);
  }

  /** Marca la inasistencia de una cita que ya ocurrió. */
  async noAsistio(actor: UsuarioAutenticado, id: number): Promise<CitaVista> {
    const c = await this.cargar(id);
    if (actor.rol === Rol.MEDICO && c.medicoId !== actor.id) throw new NotFoundException('Cita no encontrada');
    if (c.inicio.getTime() > Date.now()) throw new BadRequestException('La cita aún no ocurre');
    await this.cambiarEstado(actor, c, EstadoCita.NO_ASISTIO);
    return this.vista(actor, id);
  }

  /** Marca como inasistentes las citas reservadas de días anteriores que nadie cerró. Lo ejecuta la tarea diaria. */
  async marcarInasistencias(): Promise<number> {
    const hasta = inicioDiaUtc(hoyLocal());
    const pend: Array<{ id: number }> = await this.ds.query(`SELECT id FROM citas WHERE estado = 'RESERVADA' AND fin < ?`, [hasta]);
    for (const { id } of pend) {
      await this.ds.transaction(async (m) => {
        const r = await m.update(Cita, { id, estado: EstadoCita.RESERVADA }, { estado: EstadoCita.NO_ASISTIO });
        if (r.affected === 1) await m.insert(CitaHistorial, { citaId: id, estadoAnterior: 'RESERVADA', estadoNuevo: 'NO_ASISTIO', usuarioId: (await m.query('SELECT creada_por AS u FROM citas WHERE id = ?', [id]))[0].u });
      });
    }
    return pend.length;
  }

  // ───────────────────────── Consultas ─────────────────────────

  /** Detalle de una cita con su historial de estados. */
  async detalle(actor: UsuarioAutenticado, id: number) {
    const c = await this.cargar(id);
    this.verificarAcceso(actor, c);
    const hist = await this.ds.query(
      `SELECT h.estado_anterior AS estadoAnterior, h.estado_nuevo AS estadoNuevo, h.created_at AS fecha,
              TRIM(CONCAT_WS(' ', u.titulo, u.nombres, u.apellido_paterno)) AS usuario
       FROM citas_historial h JOIN usuarios u ON u.id = h.usuario_id WHERE h.cita_id = ? ORDER BY h.id`,
      [id],
    );
    return { ...(await this.vista(actor, id)), historial: hist };
  }

  private async vista(actor: UsuarioAutenticado, id: number): Promise<CitaVista> {
    const [f] = await this.ds.query(`${SELECT} WHERE c.id = ?`, [id]);
    return this.aVista(f, actor.rol !== Rol.ADMINISTRADOR);
  }

  private rangoUtc(fecha?: string, desde?: string, hasta?: string): { desde: Date; hasta: Date } {
    const d = fecha ?? desde ?? hoyLocal();
    const h = fecha ?? hasta ?? d;
    if (h < d) throw new BadRequestException('La fecha hasta no puede ser anterior a la fecha desde');
    if (Date.parse(h) - Date.parse(d) > 92 * 86_400_000) throw new BadRequestException('El rango no puede superar 92 días');
    return { desde: inicioDiaUtc(d), hasta: inicioDiaUtc(sumarDias(h, 1)) };
  }

  /** Agenda general de recepción y administración, con filtros. El administrador no ve las notas. */
  async agendaGeneral(actor: UsuarioAutenticado, f: FiltroCitasDto): Promise<Pagina<CitaVista>> {
    const r = this.rangoUtc(f.fecha, f.desde, f.hasta);
    const cond = ['c.inicio >= ?', 'c.inicio < ?'];
    const params: unknown[] = [r.desde, r.hasta];
    if (f.medico) (cond.push('c.medico_id = ?'), params.push(f.medico));
    if (f.paciente) (cond.push('c.paciente_id = ?'), params.push(f.paciente));
    if (f.estado) (cond.push('c.estado = ?'), params.push(f.estado));
    const where = cond.join(' AND ');
    const [{ total }] = await this.ds.query(`SELECT COUNT(*) AS total FROM citas c WHERE ${where}`, params);
    const filas = await this.ds.query(`${SELECT} WHERE ${where} ORDER BY c.inicio, c.id LIMIT ? OFFSET ?`, [...params, f.tamano, desplazamiento(f)]);
    return armarPagina(filas.map((x: any) => this.aVista(x, actor.rol === Rol.RECEPCIONISTA)), Number(total), f);
  }

  /** Agenda del médico autenticado. Incluye la atención clínica ligada a cada cita. */
  async delMedico(actor: UsuarioAutenticado, fecha?: string, desde?: string, hasta?: string): Promise<CitaVista[]> {
    const r = this.rangoUtc(fecha, desde, hasta);
    const filas = await this.ds.query(
      `SELECT x.*, (SELECT a.id FROM atenciones a WHERE a.cita_id = x.id ORDER BY a.id DESC LIMIT 1) AS atencionId,
              (SELECT a.estado FROM atenciones a WHERE a.cita_id = x.id ORDER BY a.id DESC LIMIT 1) AS atencionEstado
       FROM (${SELECT} WHERE c.medico_id = ? AND c.inicio >= ? AND c.inicio < ? AND c.estado <> 'CANCELADA') x ORDER BY x.inicio, x.id`,
      [actor.id, r.desde, r.hasta],
    );
    return filas.map((x: any) => this.aVista(x, true));
  }

  /** Citas del propio paciente: próximas o historial. */
  async mias(actor: UsuarioAutenticado, f: FiltroMisCitasDto): Promise<Pagina<CitaVista>> {
    const cond = ['c.paciente_id = ?'];
    const params: unknown[] = [actor.id];
    if (f.estado === 'proximas') cond.push(`c.estado IN ('RESERVADA','EN_ESPERA','EN_ATENCION') AND c.fin > UTC_TIMESTAMP(6)`);
    if (f.estado === 'historial') cond.push(`(c.estado IN ('ATENDIDA','CANCELADA','NO_ASISTIO') OR c.fin <= UTC_TIMESTAMP(6))`);
    const where = cond.join(' AND ');
    const [{ total }] = await this.ds.query(`SELECT COUNT(*) AS total FROM citas c WHERE ${where}`, params);
    const orden = f.estado === 'proximas' ? 'c.inicio ASC' : 'c.inicio DESC';
    const filas = await this.ds.query(`${SELECT} WHERE ${where} ORDER BY ${orden} LIMIT ? OFFSET ?`, [...params, f.tamano, desplazamiento(f)]);
    return armarPagina(filas.map((x: any) => this.aVista(x, false)), Number(total), f);
  }
}
