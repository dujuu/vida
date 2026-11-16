import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AccesoClinicoService } from '../asignaciones/acceso-clinico.service.js';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { hoyLocal, inicioDiaUtc, sumarDias, utcALocal } from '../common/fechas.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { ModoPauta } from '../recomendaciones/modo-pauta.enum.js';
import { EstadoEvento, EventoTratamiento } from './evento-tratamiento.entity.js';
import { generarEventos, type EntradaPauta } from './generador.js';

/** Horizonte de generación de tomas: tratamientos largos se extienden a medida que se acercan. */
export const HORIZONTE_DIAS = 90;

/** Una toma lista para mostrar en el calendario. */
export interface EventoVista {
  id: string;
  programadoEn: Date;
  estado: EstadoEvento;
  registradoEn: Date | null;
  horaReal: Date | null;
  nota: string | null;
  motivoAnulacion: string | null;
  /** Es una toma pendiente cuya hora ya pasó. */
  atrasada: boolean;
  /** El paciente todavía puede marcarla o corregirla. */
  puedeMarcar: boolean;
  recomendacion: {
    id: number;
    titulo: string;
    tipo: string;
    medicamento: string | null;
    dosis: string | null;
    via: string | null;
    presentacion: string | null;
    doctor: string;
  };
}

/**
 * Convierte cada pauta en tomas con fecha y hora, entrega el calendario del paciente y registra lo que el
 * paciente declara. El calendario no es una tabla: es una consulta sobre eventos, citas e indicaciones.
 *
 * Lo que el paciente marca es un autorreporte. Un recordatorio no es evidencia de que tomó un medicamento, y
 * una toma no marcada queda "sin registro" para siempre: el sistema nunca la convierte en omitida.
 */
@Injectable()
export class CalendarioService {
  constructor(
    @InjectRepository(EventoTratamiento) private readonly eventos: Repository<EventoTratamiento>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: AccesoClinicoService,
  ) {}

  // ───────────────────────── Generación (la usa el módulo de indicaciones) ─────────────────────────

  /**
   * Genera las tomas de una pauta desde un instante y las inserta; las que ya existían no se duplican.
   *
   * @returns Cantidad de tomas generadas.
   */
  async generar(m: EntityManager, pautaId: number, recomendacionId: number, pacienteId: number, entrada: EntradaPauta, desde: Date): Promise<number> {
    const hasta = new Date(Date.now() + HORIZONTE_DIAS * 86_400_000);
    const instantes = generarEventos(entrada, { desde, hasta });
    for (let i = 0; i < instantes.length; i += 500) {
      await m
        .createQueryBuilder()
        .insert()
        .into(EventoTratamiento)
        .values(instantes.slice(i, i + 500).map((programadoEn) => ({ pautaId, recomendacionId, pacienteId, programadoEn, estado: EstadoEvento.PENDIENTE })))
        .orIgnore()
        .execute();
    }
    return instantes.length;
  }

  /**
   * Anula las tomas futuras pendientes de una indicación. Las pasadas o ya marcadas no se tocan: el historial de
   * lo que el paciente hizo no puede cambiar. Las anuladas siguen visibles, con su motivo.
   */
  async anularFuturos(m: EntityManager, recomendacionId: number, motivo: string): Promise<number> {
    const r = await m
      .createQueryBuilder()
      .update(EventoTratamiento)
      .set({ estado: EstadoEvento.ANULADA, motivoAnulacion: motivo })
      .where(`recomendacion_id = :recomendacionId AND estado = 'PENDIENTE' AND programado_en > :ahora`, { recomendacionId, ahora: new Date() })
      .execute();
    return r.affected ?? 0;
  }

  /** Extiende el horizonte de las pautas vigentes. Lo ejecuta la tarea diaria. */
  async extenderHorizonte(): Promise<number> {
    const pautas: Array<{ id: number; recomendacionId: number; pacienteId: number; modo: ModoPauta; intervaloHoras: number | null; horasLocales: string | null; inicioLocal: string; duracionDias: number; diasSemana: string | null }> =
      await this.ds.query(
        `SELECT p.id, p.recomendacion_id AS recomendacionId, r.paciente_id AS pacienteId, p.modo, p.intervalo_horas AS intervaloHoras,
                p.horas_locales AS horasLocales, p.inicio_local AS inicioLocal, p.duracion_dias AS duracionDias, p.dias_semana AS diasSemana
         FROM pautas p JOIN recomendaciones r ON r.id = p.recomendacion_id
         WHERE p.vigente = 1 AND r.estado = 'ACTIVA' AND p.modo <> 'SEGUN_NECESIDAD'`,
      );
    let total = 0;
    for (const p of pautas) {
      await this.ds.transaction(async (m) => {
        total += await this.generar(m, p.id, p.recomendacionId, p.pacienteId, {
          modo: p.modo,
          intervaloHoras: p.intervaloHoras,
          horasLocales: p.horasLocales ? p.horasLocales.split(',') : null,
          inicioLocal: p.inicioLocal,
          duracionDias: p.duracionDias,
          diasSemana: p.diasSemana ? p.diasSemana.split(',').map(Number) : null,
        }, new Date());
      });
    }
    return total;
  }

  // ───────────────────────── Reglas de marcado ─────────────────────────

  /** Último instante en que el paciente puede marcar una toma: el fin del día local siguiente (configurable). */
  async limiteMarcado(programado: Date): Promise<Date> {
    const plazo = await this.config.numero('toma_plazo_dias');
    return inicioDiaUtc(sumarDias(utcALocal(programado).fecha, plazo + 1));
  }

  private async aVista(f: any, ahora: Date, plazoDias: number): Promise<EventoVista> {
    const programadoEn = new Date(f.programadoEn);
    const limite = inicioDiaUtc(sumarDias(utcALocal(programadoEn).fecha, plazoDias + 1));
    return {
      id: String(f.id),
      programadoEn,
      estado: f.estado,
      registradoEn: f.registradoEn,
      horaReal: f.horaReal,
      nota: f.nota,
      motivoAnulacion: f.motivoAnulacion,
      atrasada: f.estado === EstadoEvento.PENDIENTE && programadoEn.getTime() < ahora.getTime(),
      puedeMarcar: f.estado !== EstadoEvento.ANULADA && ahora.getTime() < limite.getTime() && programadoEn.getTime() <= ahora.getTime() + 2 * 3_600_000,
      recomendacion: {
        id: f.recomendacionId,
        titulo: f.titulo,
        tipo: f.tipo,
        medicamento: f.medicamento,
        dosis: f.dosis,
        via: f.via,
        presentacion: f.presentacion,
        doctor: f.doctor,
      },
    };
  }

  private static readonly SELECT_EVENTOS = `
    SELECT e.id, e.programado_en AS programadoEn, e.estado, e.registrado_en AS registradoEn, e.hora_real AS horaReal, e.nota,
           e.motivo_anulacion AS motivoAnulacion, r.id AS recomendacionId, r.titulo, r.tipo,
           pa.medicamento, pa.dosis, pa.via, pa.presentacion,
           TRIM(CONCAT_WS(' ', d.titulo, d.nombres, d.apellido_paterno)) AS doctor
    FROM eventos_tratamiento e
    JOIN pautas pa ON pa.id = e.pauta_id
    JOIN recomendaciones r ON r.id = e.recomendacion_id
    JOIN usuarios d ON d.id = r.doctor_id`;

  private rango(desde: string, hasta: string): { desde: Date; hasta: Date } {
    if (hasta < desde) throw new BadRequestException('La fecha hasta no puede ser anterior a la fecha desde');
    if (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`) > 92 * 86_400_000) throw new BadRequestException('El rango no puede superar 92 días');
    return { desde: inicioDiaUtc(desde), hasta: inicioDiaUtc(sumarDias(hasta, 1)) };
  }

  // ───────────────────────── Calendario del paciente ─────────────────────────

  /**
   * Une tomas, citas e indicaciones vigentes de un rango. `soloDoctorId` restringe las indicaciones a las de un
   * médico (cuando su relación con el paciente está cerrada).
   */
  async calendario(pacienteId: number, desde: string, hasta: string, soloDoctorId?: number) {
    const r = this.rango(desde, hasta);
    const ahora = new Date();
    const plazo = await this.config.numero('toma_plazo_dias');
    const filtroDoctor = soloDoctorId ? ' AND r.doctor_id = ?' : '';
    const filas = await this.ds.query(
      `${CalendarioService.SELECT_EVENTOS} WHERE e.paciente_id = ? AND e.programado_en >= ? AND e.programado_en < ?${filtroDoctor} ORDER BY e.programado_en, e.id`,
      soloDoctorId ? [pacienteId, r.desde, r.hasta, soloDoctorId] : [pacienteId, r.desde, r.hasta],
    );
    const eventos = await Promise.all(filas.map((f: any) => this.aVista(f, ahora, plazo)));
    const citas = soloDoctorId
      ? []
      : await this.ds.query(
          `SELECT c.id, c.inicio, c.fin, c.estado, TRIM(CONCAT_WS(' ', m.titulo, m.nombres, m.apellido_paterno)) AS medico
           FROM citas c JOIN usuarios m ON m.id = c.medico_id
           WHERE c.paciente_id = ? AND c.estado <> 'CANCELADA' AND c.inicio >= ? AND c.inicio < ? ORDER BY c.inicio`,
          [pacienteId, r.desde, r.hasta],
        );
    const generales = await this.ds.query(
      `SELECT r.id, r.titulo, r.tipo, r.fecha_inicio AS fechaInicio, r.fecha_fin AS fechaFin, r.estado,
              TRIM(CONCAT_WS(' ', d.titulo, d.nombres, d.apellido_paterno)) AS doctor
       FROM recomendaciones r JOIN usuarios d ON d.id = r.doctor_id
       WHERE r.paciente_id = ? AND r.estado = 'ACTIVA'
         AND (r.fecha_inicio IS NULL OR r.fecha_inicio <= ?) AND (r.fecha_fin IS NULL OR r.fecha_fin >= ?)
         AND NOT EXISTS (SELECT 1 FROM pautas p WHERE p.recomendacion_id = r.id AND p.vigente = 1 AND p.modo <> 'SEGUN_NECESIDAD')${filtroDoctor}
       ORDER BY r.created_at DESC`,
      soloDoctorId ? [pacienteId, hasta, desde, soloDoctorId] : [pacienteId, hasta, desde],
    );
    return { desde, hasta, eventos, citas, indicacionesVigentes: generales };
  }

  /** Lo de hoy: tomas del día más las atrasadas que aún se pueden marcar, citas del día y avisos sin leer. */
  async hoy(actor: UsuarioAutenticado) {
    const fecha = hoyLocal();
    const plazo = await this.config.numero('toma_plazo_dias');
    const ahora = new Date();
    const desde = inicioDiaUtc(sumarDias(fecha, -plazo));
    const hasta = inicioDiaUtc(sumarDias(fecha, 1));
    const filas = await this.ds.query(
      `${CalendarioService.SELECT_EVENTOS} WHERE e.paciente_id = ? AND e.programado_en >= ? AND e.programado_en < ?
         AND (e.programado_en >= ? OR e.estado = 'PENDIENTE') AND e.estado <> 'ANULADA' ORDER BY e.programado_en, e.id`,
      [actor.id, desde, hasta, inicioDiaUtc(fecha)],
    );
    const eventos = await Promise.all(filas.map((f: any) => this.aVista(f, ahora, plazo)));
    const citas = await this.ds.query(
      `SELECT c.id, c.inicio, c.fin, c.estado, TRIM(CONCAT_WS(' ', m.titulo, m.nombres, m.apellido_paterno)) AS medico, e.nombre AS especialidad
       FROM citas c JOIN usuarios m ON m.id = c.medico_id LEFT JOIN perfil_profesional pp ON pp.usuario_id = m.id LEFT JOIN especialidades e ON e.id = pp.especialidad_id
       WHERE c.paciente_id = ? AND c.estado IN ('RESERVADA','EN_ESPERA','EN_ATENCION') AND c.inicio >= ? AND c.inicio < ? ORDER BY c.inicio`,
      [actor.id, inicioDiaUtc(fecha), hasta],
    );
    const [{ n }] = await this.ds.query(`SELECT COUNT(*) AS n FROM recomendaciones WHERE paciente_id = ? AND leida_at IS NULL AND estado = 'ACTIVA'`, [actor.id]);
    return { fecha, ahora, eventos, citas, indicacionesSinLeer: Number(n) };
  }

  /** Por día del mes: cuántas tomas hay, cuántas se marcaron y si hay cita. Para pintar el calendario de mes. */
  async resumenMes(pacienteId: number, mes: string) {
    const primero = `${mes}-01`;
    if (new Date(`${primero}T00:00:00Z`).toISOString().slice(0, 7) !== mes) throw new BadRequestException('El mes no es válido');
    const siguiente = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 1)).toISOString().slice(0, 10);
    const desde = inicioDiaUtc(primero);
    const hasta = inicioDiaUtc(siguiente);
    const ev = await this.ds.query(`SELECT programado_en AS t, estado FROM eventos_tratamiento WHERE paciente_id = ? AND programado_en >= ? AND programado_en < ? AND estado <> 'ANULADA'`, [pacienteId, desde, hasta]);
    const ci = await this.ds.query(`SELECT inicio AS t FROM citas WHERE paciente_id = ? AND estado <> 'CANCELADA' AND inicio >= ? AND inicio < ?`, [pacienteId, desde, hasta]);
    const dias = new Map<string, { fecha: string; tomas: number; marcadas: number; hayCita: boolean }>();
    const dia = (t: Date) => {
      const f = utcALocal(new Date(t)).fecha;
      if (!dias.has(f)) dias.set(f, { fecha: f, tomas: 0, marcadas: 0, hayCita: false });
      return dias.get(f)!;
    };
    for (const e of ev) {
      const d = dia(e.t);
      d.tomas++;
      if (e.estado === 'REALIZADA' || e.estado === 'OMITIDA') d.marcadas++;
    }
    for (const c of ci) dia(c.t).hayCita = true;
    return [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // ───────────────────────── Marcar tomas ─────────────────────────

  /**
   * El paciente marca una toma como realizada, omitida, o la devuelve a pendiente. Solo puede hacerlo desde
   * poco antes de su hora y hasta el fin del día siguiente (configurable); después queda fija.
   *
   * @throws NotFoundException si la toma es de otro paciente.
   * @throws ConflictException si venció el plazo.
   */
  async marcar(actor: UsuarioAutenticado, id: string, accion: 'realizada' | 'omitida' | 'deshacer', datos: { horaReal?: string; nota?: string } = {}): Promise<EventoVista> {
    const e = await this.eventos.findOneBy({ id });
    if (!e || e.pacienteId !== actor.id) throw new NotFoundException('Toma no encontrada');
    if (e.estado === EstadoEvento.ANULADA) throw new BadRequestException('Esta toma fue anulada por su médico');
    const ahora = new Date();
    if (ahora.getTime() >= (await this.limiteMarcado(e.programadoEn)).getTime()) {
      throw new ConflictException({ statusCode: 409, message: 'Ya pasó el plazo para marcar esta toma.', codigo: 'PLAZO_VENCIDO' });
    }
    if (accion !== 'deshacer' && e.programadoEn.getTime() > ahora.getTime() + 2 * 3_600_000) {
      throw new BadRequestException('Aún no es hora de esta toma');
    }
    if (accion === 'deshacer' && e.estado === EstadoEvento.PENDIENTE) throw new BadRequestException('La toma ya está pendiente');
    let horaReal: Date | null = null;
    if (accion === 'realizada' && datos.horaReal) {
      horaReal = new Date(datos.horaReal);
      if (Number.isNaN(horaReal.getTime()) || horaReal.getTime() > ahora.getTime() + 5 * 60_000) throw new BadRequestException('La hora real no es válida');
    }
    const estado = accion === 'realizada' ? EstadoEvento.REALIZADA : accion === 'omitida' ? EstadoEvento.OMITIDA : EstadoEvento.PENDIENTE;
    await this.eventos.update(
      { id },
      accion === 'deshacer'
        ? { estado, registradoEn: null, horaReal: null, nota: null }
        : { estado, registradoEn: ahora, horaReal: accion === 'realizada' ? (horaReal ?? ahora) : null, nota: datos.nota ?? null },
    );
    await this.auditoria.registrar(actor, Accion.TOMA_MARCAR, { recurso: 'evento', recursoId: id, pacienteId: actor.id, detalle: estado });
    const [f] = await this.ds.query(`${CalendarioService.SELECT_EVENTOS} WHERE e.id = ?`, [id]);
    return this.aVista(f, ahora, await this.config.numero('toma_plazo_dias'));
  }

  // ───────────────────────── Vista del médico ─────────────────────────

  /** El mismo calendario, en solo lectura, para un médico con relación con el paciente. */
  async delPaciente(actor: UsuarioAutenticado, pacienteId: number, desde: string, hasta: string) {
    const alcance = await this.acceso.exigirLectura(actor, pacienteId);
    await this.auditoria.registrar(actor, Accion.SEGUIMIENTO_LEER, { recurso: 'calendario', pacienteId });
    return this.calendario(pacienteId, desde, hasta, alcance.soloPropio ? actor.id : undefined);
  }
}
