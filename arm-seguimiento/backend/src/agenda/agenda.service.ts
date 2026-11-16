import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { hoyLocal, inicioDiaUtc, localAUtc, sumarDias, utcALocal } from '../common/fechas.util.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PerfilProfesional } from '../profesionales/profesionales.entities.js';
import { Rol } from '../usuarios/rol.enum.js';
import { BloqueHorario, Bloqueo, Feriado } from './agenda.entities.js';
import { generarGrilla, horasLibres, seSolapan, validarBloques, type Intervalo, type ReglaSemanal } from './agenda.util.js';
import type { CrearBloqueoDto, ReemplazarBloquesDto } from './agenda.dto.js';

/** Hora libre lista para mostrar. */
export interface HoraLibre {
  inicio: Date;
  fin: Date;
  /** Hora local `HH:mm`. */
  hora: string;
}

/** Cita afectada por un cambio de agenda. */
export interface CitaAfectada {
  id: number;
  pacienteId: number;
  inicio: Date;
  estado: string;
}

/** Máximo de días que se pueden consultar de una vez. */
const MAX_DIAS_CONSULTA = 35;

/**
 * Define cuándo atiende cada médico y calcula las horas libres. No guarda horas libres: las calcula cada vez
 * a partir de reglas semanales, excepciones, feriados y citas activas.
 */
@Injectable()
export class AgendaService {
  constructor(
    @InjectRepository(BloqueHorario) private readonly bloquesRepo: Repository<BloqueHorario>,
    @InjectRepository(Bloqueo) private readonly bloqueosRepo: Repository<Bloqueo>,
    @InjectRepository(Feriado) private readonly feriadosRepo: Repository<Feriado>,
    @InjectRepository(PerfilProfesional) private readonly perfiles: Repository<PerfilProfesional>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** Un médico solo edita su propia agenda; el administrador edita cualquiera. */
  private autorizar(actor: UsuarioAutenticado, medicoId: number): void {
    if (actor.rol === Rol.MEDICO && actor.id !== medicoId) throw new ForbiddenException('Solo puede modificar su propia agenda');
  }

  /** Perfil de un médico activo. @throws NotFoundException si no existe o no está activo. */
  async perfilDe(medicoId: number, m?: EntityManager): Promise<PerfilProfesional> {
    const [ok] = await (m ?? this.ds).query(
      `SELECT 1 AS ok FROM usuarios u JOIN usuario_rol r ON r.usuario_id = u.id AND r.rol = 'MEDICO' WHERE u.id = ? AND u.activo = 1`,
      [medicoId],
    );
    const perfil = ok ? await (m ? m.getRepository(PerfilProfesional) : this.perfiles).findOneBy({ usuarioId: medicoId }) : null;
    if (!perfil) throw new NotFoundException('Médico no encontrado');
    return perfil;
  }

  // ───────────────────────── Horario semanal ─────────────────────────

  /** Horario semanal vigente (desde hoy en adelante). */
  async bloques(medicoId: number): Promise<BloqueHorario[]> {
    await this.perfilDe(medicoId);
    const hoy = hoyLocal();
    return this.bloquesRepo
      .createQueryBuilder('b')
      .where('b.medico_id = :medicoId AND (b.vigente_hasta IS NULL OR b.vigente_hasta >= :hoy)', { medicoId, hoy })
      .orderBy('b.dia_semana', 'ASC')
      .addOrderBy('b.hora_inicio', 'ASC')
      .getMany();
  }

  /** Citas activas futuras que no coinciden con la grilla de un horario dado. */
  private async citasFueraDeHorario(medicoId: number, desdeFecha: string, reglas: ReglaSemanal[], duracion: number): Promise<CitaAfectada[]> {
    const citas = await this.ds.query(
      `SELECT id, paciente_id AS pacienteId, inicio, estado FROM citas
       WHERE medico_id = ? AND estado IN ('RESERVADA','EN_ESPERA') AND inicio >= ?`,
      [medicoId, inicioDiaUtc(desdeFecha)],
    );
    return citas.filter((c: CitaAfectada) => {
      const local = utcALocal(c.inicio);
      return !generarGrilla(local.fecha, reglas, duracion).some((h) => h.inicio.getTime() === new Date(c.inicio).getTime());
    });
  }

  /**
   * Reemplaza el horario semanal a partir de una fecha. Las citas ya reservadas no se tocan: si el cambio deja citas
   * fuera de horario, se informan y se exige confirmar; recepción las reprograma.
   *
   * @throws ConflictException con `citasAfectadas` si hay citas fuera del nuevo horario y no se confirmó.
   */
  async reemplazarBloques(actor: UsuarioAutenticado, medicoId: number, dto: ReemplazarBloquesDto): Promise<BloqueHorario[]> {
    this.autorizar(actor, medicoId);
    const perfil = await this.perfilDe(medicoId);
    const error = validarBloques(dto.bloques);
    if (error) throw new BadRequestException(error);
    if (dto.desde < hoyLocal()) throw new BadRequestException('La fecha de inicio no puede ser anterior a hoy');

    const nuevas: ReglaSemanal[] = dto.bloques.map((b) => ({ ...b, vigenteDesde: dto.desde, vigenteHasta: null }));
    const afectadas = await this.citasFueraDeHorario(medicoId, dto.desde, nuevas, perfil.duracionCitaMin);
    if (afectadas.length > 0 && dto.confirmar !== true) {
      throw new ConflictException({ statusCode: 409, message: 'El cambio deja citas fuera del horario. Confirme para continuar.', citasAfectadas: afectadas });
    }
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(BloqueHorario);
      await repo.createQueryBuilder().delete().where('medico_id = :medicoId AND vigente_desde >= :desde', { medicoId, desde: dto.desde }).execute();
      await repo
        .createQueryBuilder()
        .update()
        .set({ vigenteHasta: sumarDias(dto.desde, -1) })
        .where('medico_id = :medicoId AND (vigente_hasta IS NULL OR vigente_hasta >= :desde)', { medicoId, desde: dto.desde })
        .execute();
      for (const b of dto.bloques) {
        await repo.insert({ medicoId, diaSemana: b.diaSemana, horaInicio: b.horaInicio, horaFin: b.horaFin, vigenteDesde: dto.desde, vigenteHasta: null });
      }
      await this.auditoria.registrar(actor, Accion.AGENDA_EDITAR, { recurso: 'agenda', recursoId: medicoId, detalle: `horario desde ${dto.desde}` }, m);
    });
    return this.bloques(medicoId);
  }

  // ───────────────────────── Bloqueos y feriados ─────────────────────────

  /** Bloqueos que terminan hoy o después. */
  async bloqueos(medicoId: number): Promise<Bloqueo[]> {
    await this.perfilDe(medicoId);
    return this.bloqueosRepo.createQueryBuilder('b').where('b.medico_id = :medicoId AND b.hasta >= :ahora', { medicoId, ahora: new Date() }).orderBy('b.desde', 'ASC').getMany();
  }

  /** Citas activas que caen dentro de un intervalo. */
  async citasEnIntervalo(medicoId: number, desde: Date, hasta: Date): Promise<CitaAfectada[]> {
    return this.ds.query(
      `SELECT id, paciente_id AS pacienteId, inicio, estado FROM citas
       WHERE medico_id = ? AND estado IN ('RESERVADA','EN_ESPERA') AND inicio < ? AND fin > ? ORDER BY inicio`,
      [medicoId, hasta, desde],
    );
  }

  /**
   * Crea un bloqueo. Nunca cancela citas: si hay citas dentro del rango, se informan y se exige confirmar, y
   * recepción recibe un aviso para reprogramarlas.
   */
  async crearBloqueo(actor: UsuarioAutenticado, medicoId: number, dto: CrearBloqueoDto): Promise<{ bloqueo: Bloqueo; citasAfectadas: CitaAfectada[] }> {
    this.autorizar(actor, medicoId);
    await this.perfilDe(medicoId);
    const desde = localAUtc(dto.fechaDesde, dto.horaDesde);
    const hasta = localAUtc(dto.fechaHasta, dto.horaHasta);
    if (hasta.getTime() <= desde.getTime()) throw new BadRequestException('El término del bloqueo debe ser posterior al inicio');
    if (hasta.getTime() < Date.now()) throw new BadRequestException('El bloqueo no puede estar completamente en el pasado');
    const afectadas = await this.citasEnIntervalo(medicoId, desde, hasta);
    if (afectadas.length > 0 && dto.confirmar !== true) {
      throw new ConflictException({ statusCode: 409, message: 'Hay citas dentro del bloqueo. Confirme para continuar.', citasAfectadas: afectadas });
    }
    const bloqueo = await this.bloqueosRepo.save(
      this.bloqueosRepo.create({ medicoId, desde, hasta, motivo: dto.motivo ?? 'OTRO', detalle: dto.detalle ?? null, creadoPor: actor.id }),
    );
    await this.auditoria.registrar(actor, Accion.AGENDA_EDITAR, { recurso: 'bloqueo', recursoId: bloqueo.id, detalle: `medico ${medicoId}` });
    if (afectadas.length > 0) {
      const receps = await this.ds.query(`SELECT u.id FROM usuario_rol r JOIN usuarios u ON u.id = r.usuario_id WHERE r.rol = 'RECEPCIONISTA' AND u.activo = 1`);
      for (const r of receps) {
        await this.notificaciones.crear(r.id, 'CITAS_AFECTADAS', 'Citas afectadas por un bloqueo', `Un bloqueo de agenda dejó ${afectadas.length} cita(s) por reprogramar.`, '/recepcion/agenda');
      }
    }
    return { bloqueo, citasAfectadas: afectadas };
  }

  /** Elimina un bloqueo. */
  async borrarBloqueo(actor: UsuarioAutenticado, medicoId: number, id: number): Promise<void> {
    this.autorizar(actor, medicoId);
    const r = await this.bloqueosRepo.delete({ id, medicoId });
    if (r.affected === 0) throw new NotFoundException('Bloqueo no encontrado');
    await this.auditoria.registrar(actor, Accion.AGENDA_EDITAR, { recurso: 'bloqueo', recursoId: id, detalle: 'eliminar' });
  }

  listarFeriados(): Promise<Feriado[]> {
    return this.feriadosRepo.find({ order: { fecha: 'ASC' } });
  }

  async crearFeriado(actor: UsuarioAutenticado, fecha: string, nombre: string): Promise<Feriado> {
    if (new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha) throw new BadRequestException('La fecha no es válida');
    if (await this.feriadosRepo.existsBy({ fecha })) throw new ConflictException('Ese feriado ya existe');
    const f = await this.feriadosRepo.save({ fecha, nombre });
    await this.auditoria.registrar(actor, Accion.AGENDA_EDITAR, { recurso: 'feriado', recursoId: fecha });
    return f;
  }

  async borrarFeriado(actor: UsuarioAutenticado, fecha: string): Promise<void> {
    const r = await this.feriadosRepo.delete({ fecha });
    if (r.affected === 0) throw new NotFoundException('Feriado no encontrado');
    await this.auditoria.registrar(actor, Accion.AGENDA_EDITAR, { recurso: 'feriado', recursoId: fecha, detalle: 'eliminar' });
  }

  // ───────────────────────── Horas libres ─────────────────────────

  /** Carga reglas, bloqueos, citas activas y feriados de varios médicos para un rango. */
  private async cargar(medicoIds: number[], desde: Date, hasta: Date, m?: EntityManager) {
    const q = (m ?? this.ds).query.bind(m ?? this.ds);
    const marcas = medicoIds.map(() => '?').join(',');
    const reglas: Array<ReglaSemanal & { medicoId: number }> = (
      await q(`SELECT medico_id AS medicoId, dia_semana AS diaSemana, hora_inicio AS horaInicio, hora_fin AS horaFin, vigente_desde AS vigenteDesde, vigente_hasta AS vigenteHasta FROM bloques_horario WHERE medico_id IN (${marcas})`, medicoIds)
    ).map((r: any) => ({
      ...r,
      vigenteDesde: r.vigenteDesde instanceof Date ? r.vigenteDesde.toISOString().slice(0, 10) : r.vigenteDesde,
      vigenteHasta: r.vigenteHasta instanceof Date ? r.vigenteHasta.toISOString().slice(0, 10) : r.vigenteHasta,
    }));
    const bloqueos: Array<Intervalo & { medicoId: number }> = (
      await q(`SELECT medico_id AS medicoId, desde AS inicio, hasta AS fin FROM bloqueos WHERE medico_id IN (${marcas}) AND desde < ? AND hasta > ?`, [...medicoIds, hasta, desde])
    ).map((r: any) => ({ medicoId: r.medicoId, inicio: new Date(r.inicio), fin: new Date(r.fin) }));
    const citas: Array<Intervalo & { medicoId: number }> = (
      await q(`SELECT medico_id AS medicoId, inicio, fin FROM citas WHERE medico_id IN (${marcas}) AND estado <> 'CANCELADA' AND inicio < ? AND fin > ?`, [...medicoIds, hasta, desde])
    ).map((r: any) => ({ medicoId: r.medicoId, inicio: new Date(r.inicio), fin: new Date(r.fin) }));
    const feriados = new Set<string>(
      (await q('SELECT fecha FROM feriados WHERE fecha >= ? AND fecha <= ?', [utcALocal(desde).fecha, utcALocal(hasta).fecha])).map((r: any) =>
        r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : r.fecha,
      ),
    );
    return { reglas, bloqueos, citas, feriados };
  }

  /** Límites de antelación que se aplican solo cuando reserva el propio paciente. */
  private async limitesPaciente(): Promise<{ minimo: Date; maximo: Date }> {
    const minH = await this.config.numero('reserva_antelacion_min_horas');
    const maxD = await this.config.numero('reserva_antelacion_max_dias');
    const ahora = Date.now();
    return { minimo: new Date(ahora + minH * 3_600_000), maximo: new Date(ahora + maxD * 86_400_000) };
  }

  /**
   * Horas libres de un médico entre dos fechas locales, agrupadas por día.
   *
   * @param comoPaciente Si es verdadero, aplica la antelación mínima y máxima y exige que el médico acepte reservas en línea.
   */
  async horasLibres(medicoId: number, desde: string, hasta: string, comoPaciente: boolean): Promise<Array<{ fecha: string; horas: HoraLibre[] }>> {
    if (hasta < desde) throw new BadRequestException('La fecha hasta no puede ser anterior a la fecha desde');
    const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
    if (dias > MAX_DIAS_CONSULTA) throw new BadRequestException(`Puede consultar hasta ${MAX_DIAS_CONSULTA} días a la vez`);
    const perfil = await this.perfilDe(medicoId);
    if (comoPaciente && !perfil.aceptaReservas) return [];
    const ctx = await this.cargar([medicoId], inicioDiaUtc(desde), inicioDiaUtc(sumarDias(hasta, 1)));
    const lim = comoPaciente ? await this.limitesPaciente() : undefined;
    const ahora = new Date();
    const salida: Array<{ fecha: string; horas: HoraLibre[] }> = [];
    for (let i = 0; i < dias; i++) {
      const fecha = sumarDias(desde, i);
      const libres = horasLibres(generarGrilla(fecha, ctx.reglas, perfil.duracionCitaMin), {
        bloqueos: ctx.bloqueos,
        citas: ctx.citas,
        feriado: ctx.feriados.has(fecha),
        ahora,
        minimo: lim?.minimo,
        maximo: lim?.maximo,
      });
      if (libres.length > 0) salida.push({ fecha, horas: libres.map((h) => ({ inicio: h.inicio, fin: h.fin, hora: utcALocal(h.inicio).hora })) });
    }
    return salida;
  }

  /** Días de un mes con al menos una hora libre en cualquier médico de una especialidad. */
  async diasConHoras(especialidadId: number, mes: string, comoPaciente: boolean): Promise<string[]> {
    const primero = `${mes}-01`;
    if (new Date(`${primero}T00:00:00Z`).toISOString().slice(0, 7) !== mes) throw new BadRequestException('El mes no es válido');
    const siguiente = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 1)).toISOString().slice(0, 10);
    const medicos: Array<{ id: number; dur: number }> = await this.ds.query(
      `SELECT u.id, p.duracion_cita_min AS dur FROM usuarios u JOIN usuario_rol r ON r.usuario_id = u.id AND r.rol = 'MEDICO'
       JOIN perfil_profesional p ON p.usuario_id = u.id WHERE u.activo = 1 AND p.especialidad_id = ? ${comoPaciente ? 'AND p.acepta_reservas = 1' : ''}`,
      [especialidadId],
    );
    if (medicos.length === 0) return [];
    const ctx = await this.cargar(medicos.map((x) => x.id), inicioDiaUtc(primero), inicioDiaUtc(siguiente));
    const lim = comoPaciente ? await this.limitesPaciente() : undefined;
    const ahora = new Date();
    const dias: string[] = [];
    for (let f = primero; f < siguiente; f = sumarDias(f, 1)) {
      const hay = medicos.some((med) =>
        horasLibres(generarGrilla(f, ctx.reglas.filter((r) => r.medicoId === med.id), med.dur), {
          bloqueos: ctx.bloqueos.filter((b) => b.medicoId === med.id),
          citas: ctx.citas.filter((c) => c.medicoId === med.id),
          feriado: ctx.feriados.has(f),
          ahora,
          minimo: lim?.minimo,
          maximo: lim?.maximo,
        }).length > 0,
      );
      if (hay) dias.push(f);
    }
    return dias;
  }

  /**
   * Valida que una hora de inicio pertenezca a la grilla del médico y no esté bloqueada ni sea feriado.
   * La reserva real la protege la restricción única de la base de datos; esto atrapa horas inexistentes.
   *
   * @returns La hora de término según la duración del médico.
   * @throws BadRequestException si la hora no está disponible.
   */
  async validarHora(medicoId: number, inicio: Date, comoPaciente: boolean, m?: EntityManager): Promise<{ fin: Date; perfil: PerfilProfesional }> {
    const perfil = await this.perfilDe(medicoId, m);
    if (comoPaciente && !perfil.aceptaReservas) throw new BadRequestException('Este médico no acepta reservas en línea');
    const local = utcALocal(inicio);
    const ctx = await this.cargar([medicoId], inicioDiaUtc(local.fecha), inicioDiaUtc(sumarDias(local.fecha, 1)), m);
    const grilla = generarGrilla(local.fecha, ctx.reglas, perfil.duracionCitaMin);
    const slot = grilla.find((h) => h.inicio.getTime() === inicio.getTime());
    const noDisponible = () => new ConflictException({ statusCode: 409, message: 'Esa hora ya no está disponible', codigo: 'HORA_NO_DISPONIBLE' });
    if (!slot || ctx.feriados.has(local.fecha) || ctx.bloqueos.some((b) => seSolapan(slot, b))) throw noDisponible();
    if (inicio.getTime() <= Date.now()) throw new BadRequestException('No se puede reservar una hora pasada');
    if (comoPaciente) {
      const lim = await this.limitesPaciente();
      if (inicio.getTime() < lim.minimo.getTime()) throw new BadRequestException(`Debe reservar con al menos ${await this.config.numero('reserva_antelacion_min_horas')} horas de anticipación`);
      if (inicio.getTime() > lim.maximo.getTime()) throw new BadRequestException(`Solo puede reservar hasta ${await this.config.numero('reserva_antelacion_max_dias')} días hacia adelante`);
    }
    return { fin: slot.fin, perfil };
  }
}
