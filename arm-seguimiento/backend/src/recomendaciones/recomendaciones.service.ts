import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AccesoClinicoService } from '../asignaciones/acceso-clinico.service.js';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CalendarioService } from '../calendario/calendario.service.js';
import { generarEventos, validarPauta, type EntradaPauta } from '../calendario/generador.js';
import { hoyLocal, inicioDiaUtc, sumarDias, utcALocal } from '../common/fechas.util.js';
import { armarPagina, desplazamiento, type Pagina } from '../common/paginacion.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type {
  CrearRecomendacionDto,
  EditarRecomendacionDto,
  FiltroRecomendacionesDto,
  ModificarPautaDto,
  PautaDto,
} from './crear-recomendacion.dto.js';
import { ModoPauta } from './modo-pauta.enum.js';
import { EstadoRecomendacion, Pauta, Recomendacion, RecomendacionVersion } from './recomendacion.entity.js';
import { TipoRecomendacion } from './tipo-recomendacion.enum.js';

/** Indicación lista para mostrar en listados. */
export interface IndicacionVista {
  id: number;
  tipo: TipoRecomendacion;
  titulo: string;
  descripcion: string;
  createdAt: Date;
  leidaAt: Date | null;
  estado: EstadoRecomendacion;
  /** Activa y dentro de sus fechas. */
  vigente: boolean;
  fechaInicio: string | null;
  fechaFin: string | null;
  medicamento: string | null;
  presentacion: string | null;
  dosis: string | null;
  via: string | null;
  version: number;
  motivoSuspension: string | null;
  tienePauta: boolean;
  doctor: { id: number; nombre: string; especialidad: string | null };
  paciente: { id: number; nombre: string };
}

const SELECT = `
  SELECT r.id, r.tipo, r.titulo, r.descripcion, r.created_at AS createdAt, r.leida_at AS leidaAt, r.estado,
         r.fecha_inicio AS fechaInicio, r.fecha_fin AS fechaFin, r.medicamento, r.presentacion, r.dosis, r.via, r.version,
         r.motivo_suspension AS motivoSuspension, r.doctor_id AS doctorId,
         TRIM(CONCAT_WS(' ', d.titulo, d.nombres, d.apellido_paterno)) AS doctor, e.nombre AS especialidad,
         r.paciente_id AS pacienteId, TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)) AS paciente,
         EXISTS(SELECT 1 FROM pautas pa WHERE pa.recomendacion_id = r.id AND pa.vigente = 1 AND pa.modo <> 'SEGUN_NECESIDAD') AS tienePauta
  FROM recomendaciones r
  JOIN usuarios d ON d.id = r.doctor_id
  LEFT JOIN perfil_profesional pp ON pp.usuario_id = d.id
  LEFT JOIN especialidades e ON e.id = pp.especialidad_id
  JOIN usuarios p ON p.id = r.paciente_id`;

const aFecha = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string | null) ?? null));

/**
 * Indicaciones y recomendaciones del médico al paciente, con vigencia, estados, versiones y pauta horaria.
 *
 * Reglas centrales: el sistema nunca decide dosis, vías, frecuencias ni duraciones (las escribe el médico, o las carga desde una plantilla que puede modificar);
 * cambiar una pauta crea una versión nueva y conserva lo ya registrado; solo el autor modifica, pero cualquier
 * médico con relación vigente puede suspender; nada se borra.
 */
@Injectable()
export class RecomendacionesService {
  constructor(
    @InjectRepository(Recomendacion) private readonly recs: Repository<Recomendacion>,
    @InjectRepository(Pauta) private readonly pautas: Repository<Pauta>,
    @InjectRepository(RecomendacionVersion) private readonly versiones: Repository<RecomendacionVersion>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly acceso: AccesoClinicoService,
    private readonly calendario: CalendarioService,
    private readonly notificaciones: NotificacionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ───────────────────────── Utilidades ─────────────────────────

  private aVista(f: any): IndicacionVista {
    const fechaFin = aFecha(f.fechaFin);
    return {
      id: f.id,
      tipo: f.tipo,
      titulo: f.titulo,
      descripcion: f.descripcion,
      createdAt: f.createdAt,
      leidaAt: f.leidaAt,
      estado: f.estado,
      vigente: f.estado === EstadoRecomendacion.ACTIVA && (fechaFin === null || fechaFin >= hoyLocal()),
      fechaInicio: aFecha(f.fechaInicio),
      fechaFin,
      medicamento: f.medicamento,
      presentacion: f.presentacion,
      dosis: f.dosis,
      via: f.via,
      version: f.version,
      motivoSuspension: f.motivoSuspension,
      tienePauta: !!f.tienePauta,
      doctor: { id: f.doctorId, nombre: f.doctor, especialidad: f.especialidad },
      paciente: { id: f.pacienteId, nombre: f.paciente },
    };
  }

  private entrada(p: PautaDto): EntradaPauta {
    return {
      modo: p.modo,
      intervaloHoras: p.intervaloHoras ?? null,
      horasLocales: p.horasLocales ?? null,
      inicioLocal: p.inicioLocal,
      duracionDias: p.duracionDias,
      diasSemana: p.diasSemana ?? null,
    };
  }

  /** Reglas de contenido de una indicación. Dosis, vía y frecuencia las escribe siempre el médico. */
  private validarContenido(tipo: TipoRecomendacion, med: { medicamento?: string | null; dosis?: string | null; via?: string | null }, pauta: EntradaPauta | null): void {
    if (tipo === TipoRecomendacion.MEDICAMENTO) {
      if (!med.medicamento || !med.dosis || !med.via) {
        throw new BadRequestException('Un medicamento necesita nombre, dosis y vía, escritos por el médico');
      }
    }
    if (pauta) {
      if (tipo !== TipoRecomendacion.MEDICAMENTO && tipo !== TipoRecomendacion.RUTINA) {
        throw new BadRequestException('Solo un medicamento o una rutina pueden tener pauta horaria');
      }
      const error = validarPauta(pauta);
      if (error) throw new BadRequestException(error);
    }
  }

  private async cargar(id: number, m?: EntityManager): Promise<Recomendacion> {
    const r = await (m ? m.getRepository(Recomendacion) : this.recs).findOneBy({ id });
    if (!r) throw new NotFoundException('Recomendación no encontrada');
    return r;
  }

  /** Quien modifica debe tener relación vigente (404 si no) y ser el autor (403 si no). */
  private async exigirAutor(medico: UsuarioAutenticado, r: Recomendacion): Promise<void> {
    await this.acceso.exigirEscritura(medico, r.pacienteId);
    if (r.doctorId !== medico.id) {
      throw new ForbiddenException('Solo el médico que emitió la indicación puede modificarla. Usted puede suspenderla con un motivo.');
    }
  }

  private async guardarVersion(m: EntityManager, r: Recomendacion, cambiadoPor: number, motivo: string | null): Promise<void> {
    const pauta = await m.findOneBy(Pauta, { recomendacionId: r.id, vigente: true });
    await m.insert(RecomendacionVersion, {
      recomendacionId: r.id,
      version: r.version,
      cambiadoPor,
      motivo,
      contenido: JSON.stringify({
        titulo: r.titulo,
        descripcion: r.descripcion,
        fechaInicio: r.fechaInicio,
        fechaFin: r.fechaFin,
        medicamento: r.medicamento,
        presentacion: r.presentacion,
        dosis: r.dosis,
        via: r.via,
        estado: r.estado,
        pauta: pauta ? { modo: pauta.modo, intervaloHoras: pauta.intervaloHoras, horasLocales: pauta.horasLocales, inicioLocal: pauta.inicioLocal, duracionDias: pauta.duracionDias, diasSemana: pauta.diasSemana } : null,
      }),
    });
  }

  /** Crea una versión de pauta y genera sus tomas desde ahora. */
  private async crearPauta(
    m: EntityManager,
    r: Recomendacion,
    entrada: EntradaPauta,
    version: number,
    autorId: number,
    motivo: string | null,
    med: { medicamento: string | null; presentacion: string | null; dosis: string | null; via: string | null },
  ): Promise<number> {
    const pauta = await m.save(
      m.create(Pauta, {
        recomendacionId: r.id,
        version,
        modo: entrada.modo,
        intervaloHoras: entrada.intervaloHoras ?? null,
        horasLocales: entrada.horasLocales ? entrada.horasLocales.join(',') : null,
        medicamento: med.medicamento,
        presentacion: med.presentacion,
        dosis: med.dosis,
        via: med.via,
        inicioLocal: entrada.inicioLocal,
        duracionDias: entrada.duracionDias,
        diasSemana: entrada.diasSemana && entrada.diasSemana.length ? entrada.diasSemana.join(',') : null,
        vigente: true,
        creadaPor: autorId,
        motivoCambio: motivo,
      }),
    );
    const generadas = await this.calendario.generar(m, pauta.id, r.id, r.pacienteId, entrada, new Date());
    if (entrada.modo !== ModoPauta.SEGUN_NECESIDAD && generadas === 0) {
      throw new BadRequestException('La pauta no genera ninguna toma desde ahora. Revise la fecha de inicio y la duración.');
    }
    return generadas;
  }

  // ───────────────────────── Crear ─────────────────────────

  /**
   * Vista previa de las tomas que generaría una pauta. No guarda nada; el médico la confirma antes de crear.
   *
   * @returns Cantidad y lista de tomas con su fecha y hora local.
   */
  vistaPrevia(pauta: PautaDto) {
    const entrada = this.entrada(pauta);
    const error = validarPauta(entrada);
    if (error) throw new BadRequestException(error);
    const tomas = generarEventos(entrada, { desde: new Date() });
    return { total: tomas.length, tomas: tomas.slice(0, 500).map((t) => ({ instante: t, ...utcALocal(t) })), truncado: tomas.length > 500 };
  }

  /** Crea una indicación para un paciente del médico, con o sin pauta, en una sola transacción. */
  async crear(medico: UsuarioAutenticado, dto: CrearRecomendacionDto): Promise<IndicacionVista> {
    await this.acceso.exigirEscritura(medico, dto.pacienteId);
    const pauta = dto.pauta ? this.entrada(dto.pauta) : null;
    this.validarContenido(dto.tipo, dto, pauta);
    let fechaInicio = dto.fechaInicio ?? hoyLocal();
    let fechaFin = dto.fechaFin ?? null;
    if (pauta && pauta.modo !== ModoPauta.SEGUN_NECESIDAD) {
      fechaInicio = pauta.inicioLocal.slice(0, 10);
      fechaFin = sumarDias(fechaInicio, pauta.duracionDias - 1);
    }
    if (fechaFin && fechaFin < fechaInicio) throw new BadRequestException('La fecha de término no puede ser anterior a la de inicio');
    if (dto.atencionId) {
      const [a] = await this.ds.query('SELECT 1 AS ok FROM atenciones WHERE id = ? AND medico_id = ? AND paciente_id = ?', [dto.atencionId, medico.id, dto.pacienteId]);
      if (!a) throw new BadRequestException('La atención indicada no existe o no es suya');
    }
    const med = { medicamento: dto.medicamento ?? null, presentacion: dto.presentacion ?? null, dosis: dto.dosis ?? null, via: dto.via ?? null };
    const creada = await this.ds.transaction(async (m) => {
      const r = await m.save(
        m.create(Recomendacion, {
          doctorId: medico.id,
          pacienteId: dto.pacienteId,
          tipo: dto.tipo,
          titulo: dto.titulo,
          descripcion: dto.descripcion,
          leidaAt: null,
          atencionId: dto.atencionId ?? null,
          fechaInicio,
          fechaFin,
          estado: EstadoRecomendacion.ACTIVA,
          ...med,
          version: 1,
        }),
      );
      if (pauta) await this.crearPauta(m, r, pauta, 1, medico.id, null, med);
      await this.auditoria.registrar(medico, Accion.INDICACION_ESCRIBIR, { recurso: 'recomendacion', recursoId: r.id, pacienteId: dto.pacienteId, detalle: 'crear' }, m);
      return r;
    });
    await this.notificaciones.crear(dto.pacienteId, 'INDICACION_NUEVA', 'Nueva indicación', 'Su médico le envió una indicación. Revísela en la aplicación.', '/paciente/indicaciones');
    return this.vista(creada.id);
  }

  // ───────────────────────── Modificar ─────────────────────────

  /**
   * Cambia la pauta, y opcionalmente el medicamento, la dosis y la vía. Crea una versión nueva: la anterior se
   * conserva, las tomas pasadas o ya marcadas no se tocan, las futuras pendientes de la versión anterior se
   * anulan y se generan las nuevas desde ahora.
   */
  async modificarPauta(medico: UsuarioAutenticado, id: number, dto: ModificarPautaDto): Promise<IndicacionVista> {
    const r = await this.cargar(id);
    await this.exigirAutor(medico, r);
    if (r.estado !== EstadoRecomendacion.ACTIVA) throw new BadRequestException('Solo se puede modificar una indicación activa');
    const entrada = this.entrada(dto.pauta);
    const med = {
      medicamento: dto.medicamento ?? r.medicamento,
      presentacion: dto.presentacion ?? r.presentacion,
      dosis: dto.dosis ?? r.dosis,
      via: dto.via ?? r.via,
    };
    this.validarContenido(r.tipo, med, entrada);
    await this.ds.transaction(async (m) => {
      await this.guardarVersion(m, r, medico.id, dto.motivo);
      await m.update(Pauta, { recomendacionId: id, vigente: true }, { vigente: false });
      await this.calendario.anularFuturos(m, id, 'Pauta modificada');
      const [{ v }] = await m.query('SELECT COALESCE(MAX(version), 0) AS v FROM pautas WHERE recomendacion_id = ?', [id]);
      const version = Number(v) + 1;
      await this.crearPauta(m, r, entrada, version, medico.id, dto.motivo, med);
      const fechaInicio = entrada.modo === ModoPauta.SEGUN_NECESIDAD ? r.fechaInicio : entrada.inicioLocal.slice(0, 10);
      const fechaFin = entrada.modo === ModoPauta.SEGUN_NECESIDAD ? r.fechaFin : sumarDias(entrada.inicioLocal.slice(0, 10), entrada.duracionDias - 1);
      await m.update(Recomendacion, { id }, { ...med, fechaInicio, fechaFin, version: Math.max(version, r.version + 1), leidaAt: null, updatedAt: new Date() });
      await this.auditoria.registrar(medico, Accion.INDICACION_ESCRIBIR, { recurso: 'recomendacion', recursoId: id, pacienteId: r.pacienteId, detalle: `pauta v${version}` }, m);
    });
    await this.notificaciones.crear(r.pacienteId, 'INDICACION_MODIFICADA', 'Indicación modificada', 'Su médico modificó una indicación. Revise el calendario.', '/paciente/indicaciones');
    return this.vista(id);
  }

  /**
   * Corrige el título, el texto o la fecha de término. Con pauta vigente solo se puede acortar la fecha de término;
   * extenderla o cambiar la dosis se hace modificando la pauta. Guarda la versión anterior.
   */
  async editar(medico: UsuarioAutenticado, id: number, dto: EditarRecomendacionDto): Promise<IndicacionVista> {
    const r = await this.cargar(id);
    await this.exigirAutor(medico, r);
    if (r.estado !== EstadoRecomendacion.ACTIVA) throw new BadRequestException('Solo se puede modificar una indicación activa');
    const pautaVigente = await this.pautas.findOneBy({ recomendacionId: id, vigente: true });
    const tienePauta = !!pautaVigente && pautaVigente.modo !== ModoPauta.SEGUN_NECESIDAD;
    if (tienePauta && (dto.medicamento || dto.presentacion || dto.dosis || dto.via)) {
      throw new BadRequestException('Para cambiar el medicamento, la dosis o la vía modifique la pauta: así se conserva el historial de las tomas.');
    }
    const cambios: Partial<Recomendacion> = {};
    if (dto.titulo !== undefined) cambios.titulo = dto.titulo;
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion;
    if (dto.medicamento !== undefined) cambios.medicamento = dto.medicamento || null;
    if (dto.presentacion !== undefined) cambios.presentacion = dto.presentacion || null;
    if (dto.dosis !== undefined) cambios.dosis = dto.dosis || null;
    if (dto.via !== undefined) cambios.via = dto.via || null;
    if (dto.fechaFin !== undefined) {
      if (r.fechaInicio && dto.fechaFin < r.fechaInicio) throw new BadRequestException('La fecha de término no puede ser anterior a la de inicio');
      if (tienePauta && r.fechaFin && dto.fechaFin > r.fechaFin) throw new BadRequestException('Para extender el tratamiento modifique la pauta');
      cambios.fechaFin = dto.fechaFin;
    }
    if (Object.keys(cambios).length === 0) throw new BadRequestException('No hay cambios que guardar');
    if (cambios.medicamento !== undefined || cambios.dosis !== undefined || cambios.via !== undefined) {
      this.validarContenido(r.tipo, { medicamento: cambios.medicamento ?? r.medicamento, dosis: cambios.dosis ?? r.dosis, via: cambios.via ?? r.via }, null);
    }
    await this.ds.transaction(async (m) => {
      await this.guardarVersion(m, r, medico.id, dto.motivo);
      if (tienePauta && cambios.fechaFin) {
        await m.query(`UPDATE eventos_tratamiento SET estado = 'ANULADA', motivo_anulacion = 'Tratamiento acortado' WHERE recomendacion_id = ? AND estado = 'PENDIENTE' AND programado_en >= ?`, [id, inicioDiaUtc(sumarDias(cambios.fechaFin, 1))]);
      }
      await m.update(Recomendacion, { id }, { ...cambios, version: r.version + 1, leidaAt: null, updatedAt: new Date() });
      await this.auditoria.registrar(medico, Accion.INDICACION_ESCRIBIR, { recurso: 'recomendacion', recursoId: id, pacienteId: r.pacienteId, detalle: `editar v${r.version + 1}` }, m);
    });
    await this.notificaciones.crear(r.pacienteId, 'INDICACION_MODIFICADA', 'Indicación modificada', 'Su médico modificó una indicación. Revísela en la aplicación.', '/paciente/indicaciones');
    return this.vista(id);
  }

  /** Suspende una indicación con un motivo. Puede hacerlo cualquier médico con relación vigente con el paciente. */
  async suspender(medico: UsuarioAutenticado, id: number, motivo: string): Promise<IndicacionVista> {
    const r = await this.cargar(id);
    await this.acceso.exigirEscritura(medico, r.pacienteId);
    if (r.estado !== EstadoRecomendacion.ACTIVA) throw new BadRequestException('Solo se puede suspender una indicación activa');
    await this.ds.transaction(async (m) => {
      await m.update(Recomendacion, { id }, { estado: EstadoRecomendacion.SUSPENDIDA, motivoSuspension: motivo, suspendidaPor: medico.id, suspendidaEn: new Date() });
      await this.calendario.anularFuturos(m, id, 'Indicación suspendida');
      await this.auditoria.registrar(medico, Accion.INDICACION_ESCRIBIR, { recurso: 'recomendacion', recursoId: id, pacienteId: r.pacienteId, detalle: 'suspender' }, m);
    });
    await this.notificaciones.crear(r.pacienteId, 'INDICACION_SUSPENDIDA', 'Indicación suspendida', 'Una de sus indicaciones fue suspendida. Revise el detalle en la aplicación.', '/paciente/indicaciones');
    return this.vista(id);
  }

  /** Pasa a finalizada las indicaciones activas ya vencidas y sin tomas futuras. Lo ejecuta la tarea diaria. */
  async finalizarVencidas(): Promise<number> {
    const r = await this.ds.query(
      `UPDATE recomendaciones r SET estado = 'FINALIZADA'
       WHERE r.estado = 'ACTIVA' AND r.fecha_fin IS NOT NULL AND r.fecha_fin < ?
         AND NOT EXISTS (SELECT 1 FROM eventos_tratamiento e WHERE e.recomendacion_id = r.id AND e.estado = 'PENDIENTE' AND e.programado_en > UTC_TIMESTAMP(6))`,
      [hoyLocal()],
    );
    return r.affectedRows ?? 0;
  }

  // ───────────────────────── Consultas ─────────────────────────

  private async vista(id: number): Promise<IndicacionVista> {
    const [f] = await this.ds.query(`${SELECT} WHERE r.id = ?`, [id]);
    return this.aVista(f);
  }

  private async listar(donde: string, params: unknown[], f: FiltroRecomendacionesDto): Promise<Pagina<IndicacionVista>> {
    const cond = [donde];
    const p = [...params];
    if (f.paciente) (cond.push('r.paciente_id = ?'), p.push(f.paciente));
    const hoy = hoyLocal();
    if (f.estado === 'vigentes') (cond.push(`r.estado = 'ACTIVA' AND (r.fecha_fin IS NULL OR r.fecha_fin >= ?)`), p.push(hoy));
    if (f.estado === 'anteriores') (cond.push(`(r.estado <> 'ACTIVA' OR (r.fecha_fin IS NOT NULL AND r.fecha_fin < ?))`), p.push(hoy));
    const where = cond.join(' AND ');
    const [{ total }] = await this.ds.query(`SELECT COUNT(*) AS total FROM recomendaciones r WHERE ${where}`, p);
    const filas = await this.ds.query(`${SELECT} WHERE ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...p, f.tamano, desplazamiento(f)]);
    return armarPagina(filas.map((x: any) => this.aVista(x)), Number(total), f);
  }

  /** Indicaciones que emitió el médico. */
  emitidas(medicoId: number, f: FiltroRecomendacionesDto): Promise<Pagina<IndicacionVista>> {
    return this.listar('r.doctor_id = ?', [medicoId], f);
  }

  /** Indicaciones que recibió el paciente, de cualquiera de sus médicos. */
  mias(pacienteId: number, f: FiltroRecomendacionesDto): Promise<Pagina<IndicacionVista>> {
    return this.listar('r.paciente_id = ?', [pacienteId], { ...f, paciente: undefined });
  }

  /** Todas las indicaciones de un paciente, de cualquier médico, para un médico con relación. */
  async delPaciente(medico: UsuarioAutenticado, pacienteId: number, f: FiltroRecomendacionesDto): Promise<Pagina<IndicacionVista>> {
    const alcance = await this.acceso.exigirLectura(medico, pacienteId);
    await this.auditoria.registrar(medico, Accion.INDICACION_LEER, { recurso: 'recomendacion', pacienteId });
    return alcance.soloPropio
      ? this.listar('r.paciente_id = ? AND r.doctor_id = ?', [pacienteId, medico.id], { ...f, paciente: undefined })
      : this.listar('r.paciente_id = ?', [pacienteId], { ...f, paciente: undefined });
  }

  /** Detalle con historial de versiones, pauta vigente y resumen de tomas. */
  async detalle(actor: UsuarioAutenticado, id: number) {
    const r = await this.cargar(id);
    if (actor.rol === 'PACIENTE') {
      if (r.pacienteId !== actor.id) throw new NotFoundException('Recomendación no encontrada');
    } else {
      const alcance = await this.acceso.exigirLectura(actor, r.pacienteId);
      if (alcance.soloPropio && r.doctorId !== actor.id) throw new NotFoundException('Recomendación no encontrada');
      await this.auditoria.registrar(actor, Accion.INDICACION_LEER, { recurso: 'recomendacion', recursoId: id, pacienteId: r.pacienteId });
    }
    const pautas = await this.pautas.find({ where: { recomendacionId: id }, order: { version: 'DESC' } });
    const versiones = await this.ds.query(
      `SELECT v.version, v.contenido, v.motivo, v.created_at AS fecha, TRIM(CONCAT_WS(' ', u.titulo, u.nombres, u.apellido_paterno)) AS cambiadoPor
       FROM recomendaciones_versiones v JOIN usuarios u ON u.id = v.cambiado_por WHERE v.recomendacion_id = ? ORDER BY v.version DESC`,
      [id],
    );
    const [t] = await this.ds.query(
      `SELECT COUNT(*) AS programadas, SUM(estado = 'REALIZADA') AS realizadas, SUM(estado = 'OMITIDA') AS omitidas, SUM(estado = 'ANULADA') AS anuladas,
              SUM(estado = 'PENDIENTE' AND programado_en < UTC_TIMESTAMP(6)) AS sinRegistro, SUM(estado = 'PENDIENTE' AND programado_en >= UTC_TIMESTAMP(6)) AS futuras
       FROM eventos_tratamiento WHERE recomendacion_id = ?`,
      [id],
    );
    const fmt = (p: Pauta) => ({
      version: p.version,
      vigente: p.vigente,
      modo: p.modo,
      intervaloHoras: p.intervaloHoras,
      horasLocales: p.horasLocales ? p.horasLocales.split(',') : null,
      inicioLocal: p.inicioLocal,
      duracionDias: p.duracionDias,
      diasSemana: p.diasSemana ? p.diasSemana.split(',').map(Number) : null,
      medicamento: p.medicamento,
      presentacion: p.presentacion,
      dosis: p.dosis,
      via: p.via,
      motivoCambio: p.motivoCambio,
      creada: p.createdAt,
    });
    return {
      ...(await this.vista(id)),
      pautaVigente: pautas.filter((p) => p.vigente).map(fmt)[0] ?? null,
      pautasAnteriores: pautas.filter((p) => !p.vigente).map(fmt),
      versiones: versiones.map((v: any) => ({ version: v.version, fecha: v.fecha, cambiadoPor: v.cambiadoPor, motivo: v.motivo, contenido: JSON.parse(v.contenido) })),
      tomas: {
        programadas: Number(t.programadas ?? 0),
        realizadas: Number(t.realizadas ?? 0),
        omitidas: Number(t.omitidas ?? 0),
        sinRegistro: Number(t.sinRegistro ?? 0),
        futuras: Number(t.futuras ?? 0),
        anuladas: Number(t.anuladas ?? 0),
      },
      aviso: 'Esta indicación no reemplaza la receta médica.',
    };
  }

  /** Marca una indicación como leída por el paciente. Es idempotente: conserva la fecha original. */
  async marcarLeida(pacienteId: number, id: number): Promise<IndicacionVista> {
    const r = await this.recs.findOneBy({ id, pacienteId });
    if (!r) throw new NotFoundException('Recomendación no encontrada');
    if (!r.leidaAt) await this.recs.update({ id, pacienteId }, { leidaAt: new Date() });
    return this.vista(id);
  }
}
