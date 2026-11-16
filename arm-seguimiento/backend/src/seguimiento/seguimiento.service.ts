import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AccesoClinicoService } from '../asignaciones/acceso-clinico.service.js';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { hoyLocal, inicioDiaUtc, sumarDias, utcALocal } from '../common/fechas.util.js';
import { formatearRut } from '../common/rut.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { clasificarContinuidad, type EstadoContinuidad, type ResultadoContinuidad, type SenalesContinuidad } from './continuidad.js';

/** Un grupo con menos de este número de personas no se muestra con su cifra, para que no identifique a nadie. */
export const MINIMO_GRUPO = 5;

/** Fila de un hilo médico–paciente clasificado. */
export interface HiloClasificado extends ResultadoContinuidad {
  medicoId: number;
  pacienteId: number;
  especialidad: string | null;
}

const aFecha = (v: unknown): Date | null => (v ? new Date(v as string) : null);

/**
 * Seguimiento de tratamientos y dashboard de continuidad. Solo lee datos de otros módulos.
 *
 * Todo lo que viene de las tomas es un **autorreporte del paciente**: un recordatorio enviado no prueba que tomó un
 * medicamento, y una toma sin registro nunca se cuenta como omitida.
 */
@Injectable()
export class SeguimientoService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly acceso: AccesoClinicoService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
  ) {}

  private async umbrales() {
    return { riesgoDias: await this.config.numero('continuidad_riesgo_dias'), desercionDias: await this.config.numero('continuidad_desercion_dias') };
  }

  /** Señales de continuidad de todos los hilos (o de los de un médico) en una consulta. */
  private async hilos(medicoId?: number, soloPaciente?: number): Promise<HiloClasificado[]> {
    const hoy = hoyLocal();
    const ahora = new Date();
    const cond = ['dp.vigente = 1', 'u.activo = 1'];
    const params: unknown[] = [hoy, hoy];
    if (medicoId) (cond.push('dp.doctor_id = ?'), params.push(medicoId));
    if (soloPaciente) (cond.push('dp.paciente_id = ?'), params.push(soloPaciente));
    const filas = await this.ds.query(
      `SELECT dp.doctor_id AS medicoId, dp.paciente_id AS pacienteId, e.nombre AS especialidad,
        (SELECT MIN(c.inicio) FROM citas c WHERE c.medico_id = dp.doctor_id AND c.paciente_id = dp.paciente_id AND c.estado IN ('RESERVADA','EN_ESPERA') AND c.inicio > UTC_TIMESTAMP(6)) AS proximaCita,
        (SELECT MAX(c.inicio) FROM citas c WHERE c.medico_id = dp.doctor_id AND c.paciente_id = dp.paciente_id AND c.estado = 'ATENDIDA') AS ultimaAtendida,
        (SELECT MAX(c.inicio) FROM citas c WHERE c.medico_id = dp.doctor_id AND c.paciente_id = dp.paciente_id AND c.estado = 'NO_ASISTIO') AS ultimaInasistencia,
        (SELECT MAX(c.created_at) FROM citas c WHERE c.medico_id = dp.doctor_id AND c.paciente_id = dp.paciente_id AND c.estado <> 'CANCELADA') AS ultimaReserva,
        (SELECT MAX(ev.registrado_en) FROM eventos_tratamiento ev JOIN recomendaciones r ON r.id = ev.recomendacion_id WHERE r.doctor_id = dp.doctor_id AND ev.paciente_id = dp.paciente_id) AS ultimaToma,
        (SELECT MIN(ev.programado_en) FROM eventos_tratamiento ev JOIN recomendaciones r ON r.id = ev.recomendacion_id
           WHERE r.doctor_id = dp.doctor_id AND ev.paciente_id = dp.paciente_id AND r.estado = 'ACTIVA' AND ev.estado <> 'ANULADA' AND ev.programado_en <= UTC_TIMESTAMP(6)) AS primeraTomaVencida,
        (SELECT MAX(r.leida_at) FROM recomendaciones r WHERE r.doctor_id = dp.doctor_id AND r.paciente_id = dp.paciente_id) AS ultimaLectura,
        (SELECT MIN(r.created_at) FROM recomendaciones r WHERE r.doctor_id = dp.doctor_id AND r.paciente_id = dp.paciente_id AND r.estado = 'ACTIVA' AND r.leida_at IS NULL) AS sinLeerDesde,
        GREATEST(dp.created_at, COALESCE((SELECT MAX(r.created_at) FROM recomendaciones r WHERE r.doctor_id = dp.doctor_id AND r.paciente_id = dp.paciente_id), dp.created_at)) AS ultimoContactoMedico,
        (SELECT COUNT(*) FROM recomendaciones r WHERE r.doctor_id = dp.doctor_id AND r.paciente_id = dp.paciente_id AND r.estado = 'ACTIVA' AND (r.fecha_fin IS NULL OR r.fecha_fin >= ?)) AS tratamientosVigentes,
        (SELECT COUNT(*) FROM pautas pa JOIN recomendaciones r ON r.id = pa.recomendacion_id WHERE r.doctor_id = dp.doctor_id AND r.paciente_id = dp.paciente_id AND r.estado = 'ACTIVA'
           AND pa.vigente = 1 AND pa.modo <> 'SEGUN_NECESIDAD' AND (r.fecha_fin IS NULL OR r.fecha_fin >= ?)) AS tratamientosConPauta
       FROM doctor_paciente dp
       JOIN usuarios u ON u.id = dp.paciente_id
       LEFT JOIN perfil_profesional pp ON pp.usuario_id = dp.doctor_id
       LEFT JOIN especialidades e ON e.id = pp.especialidad_id
       WHERE ${cond.join(' AND ')}`,
      params,
    );
    const u = await this.umbrales();
    return filas.map((f: any) => {
      const senales: SenalesContinuidad = {
        ahora,
        tieneCitaFutura: !!f.proximaCita,
        ultimaAtendida: aFecha(f.ultimaAtendida),
        ultimaInasistencia: aFecha(f.ultimaInasistencia),
        ultimaReserva: aFecha(f.ultimaReserva),
        ultimaToma: aFecha(f.ultimaToma),
        primeraTomaVencida: aFecha(f.primeraTomaVencida),
        ultimaLectura: aFecha(f.ultimaLectura),
        sinLeerDesde: aFecha(f.sinLeerDesde),
        ultimoContactoMedico: aFecha(f.ultimoContactoMedico),
        tratamientosVigentes: Number(f.tratamientosVigentes),
        tratamientosConPauta: Number(f.tratamientosConPauta),
      };
      return { medicoId: f.medicoId, pacienteId: f.pacienteId, especialidad: f.especialidad, proximaCita: f.proximaCita, ...clasificarContinuidad(senales, u) } as HiloClasificado;
    });
  }

  // ───────────────────────── Dashboard del médico ─────────────────────────

  /** Pacientes del médico clasificados por estado de continuidad, con filtros por estado y por texto. */
  async dashboardMedico(actor: UsuarioAutenticado, estado?: EstadoContinuidad, buscar?: string) {
    await this.auditoria.registrar(actor, Accion.SEGUIMIENTO_LEER, { recurso: 'dashboard' });
    const hilos = await this.hilos(actor.id);
    const ids = [...new Set(hilos.map((h) => h.pacienteId))];
    const nombres = new Map<number, { nombre: string; rut: string }>();
    if (ids.length) {
      const filas = await this.ds.query(`SELECT id, rut, CONCAT_WS(' ', nombres, apellido_paterno, apellido_materno) AS nombre FROM usuarios WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      for (const f of filas) nombres.set(f.id, { nombre: f.nombre, rut: formatearRut(f.rut) });
    }
    const resumen: Record<EstadoContinuidad, number> = { AL_DIA: 0, EN_RIESGO: 0, DESERTOR: 0, CERRADO: 0 };
    for (const h of hilos) resumen[h.estado]++;
    const q = (buscar ?? '').toLowerCase().trim();
    const pacientes = hilos
      .filter((h) => (!estado || h.estado === estado) && (!q || (nombres.get(h.pacienteId)?.nombre ?? '').toLowerCase().includes(q) || (nombres.get(h.pacienteId)?.rut ?? '').includes(q)))
      .map((h: any) => ({
        id: h.pacienteId,
        nombre: nombres.get(h.pacienteId)?.nombre ?? '',
        rut: nombres.get(h.pacienteId)?.rut ?? '',
        estado: h.estado,
        motivo: h.motivo,
        ultimaActividad: h.ultimaActividad,
        diasSinActividad: h.diasSinActividad,
        proximaCita: h.proximaCita,
      }))
      .sort((a, b) => ['DESERTOR', 'EN_RIESGO', 'AL_DIA', 'CERRADO'].indexOf(a.estado) - ['DESERTOR', 'EN_RIESGO', 'AL_DIA', 'CERRADO'].indexOf(b.estado) || a.nombre.localeCompare(b.nombre));
    return { rotulo: 'Los datos de tomas son un autorreporte del paciente.', resumen, pacientes };
  }

  /** Lectura de las indicaciones del médico, por paciente y por tipo (los gráficos del resumen). */
  async lectura(actor: UsuarioAutenticado) {
    const porPaciente = await this.ds.query(
      `SELECT r.paciente_id AS pacienteId, CONCAT_WS(' ', p.nombres, p.apellido_paterno) AS nombre, COUNT(*) AS enviadas, SUM(r.leida_at IS NOT NULL) AS leidas
       FROM recomendaciones r JOIN usuarios p ON p.id = r.paciente_id WHERE r.doctor_id = ? GROUP BY r.paciente_id, nombre ORDER BY nombre`,
      [actor.id],
    );
    const porTipo = await this.ds.query(`SELECT tipo, COUNT(*) AS enviadas, SUM(leida_at IS NOT NULL) AS leidas FROM recomendaciones WHERE doctor_id = ? GROUP BY tipo`, [actor.id]);
    const num = (f: any) => ({ ...f, enviadas: Number(f.enviadas), leidas: Number(f.leidas ?? 0) });
    const enviadas = porTipo.reduce((a: number, f: any) => a + Number(f.enviadas), 0);
    const leidas = porTipo.reduce((a: number, f: any) => a + Number(f.leidas ?? 0), 0);
    return { porPaciente: porPaciente.map(num), porTipo: porTipo.map(num), enviadas, leidas, tasaLectura: enviadas ? Math.round((leidas / enviadas) * 100) : null };
  }

  // ───────────────────────── Seguimiento de una indicación y de un paciente ─────────────────────────

  /** Tomas realizadas, omitidas y sin registro por día de una indicación. Es un autorreporte. */
  async deIndicacion(actor: UsuarioAutenticado, id: number) {
    const [r] = await this.ds.query('SELECT id, titulo, paciente_id AS pacienteId, doctor_id AS doctorId, estado FROM recomendaciones WHERE id = ?', [id]);
    if (!r) throw new NotFoundException('Recomendación no encontrada');
    const alcance = await this.acceso.exigirLectura(actor, r.pacienteId);
    if (alcance.soloPropio && r.doctorId !== actor.id) throw new NotFoundException('Recomendación no encontrada');
    await this.auditoria.registrar(actor, Accion.SEGUIMIENTO_LEER, { recurso: 'recomendacion', recursoId: id, pacienteId: r.pacienteId });
    const filas = await this.ds.query(`SELECT programado_en AS t, estado FROM eventos_tratamiento WHERE recomendacion_id = ? AND estado <> 'ANULADA' ORDER BY programado_en`, [id]);
    const ahora = Date.now();
    const porDia = new Map<string, { fecha: string; programadas: number; realizadas: number; omitidas: number; sinRegistro: number; futuras: number }>();
    for (const f of filas) {
      const fecha = utcALocal(new Date(f.t)).fecha;
      const d = porDia.get(fecha) ?? { fecha, programadas: 0, realizadas: 0, omitidas: 0, sinRegistro: 0, futuras: 0 };
      d.programadas++;
      if (f.estado === 'REALIZADA') d.realizadas++;
      else if (f.estado === 'OMITIDA') d.omitidas++;
      else if (new Date(f.t).getTime() < ahora) d.sinRegistro++;
      else d.futuras++;
      porDia.set(fecha, d);
    }
    const dias = [...porDia.values()];
    const total = dias.reduce((a, d) => ({ programadas: a.programadas + d.programadas, realizadas: a.realizadas + d.realizadas, omitidas: a.omitidas + d.omitidas, sinRegistro: a.sinRegistro + d.sinRegistro, futuras: a.futuras + d.futuras }), { programadas: 0, realizadas: 0, omitidas: 0, sinRegistro: 0, futuras: 0 });
    const vencidas = total.realizadas + total.omitidas + total.sinRegistro;
    return {
      indicacion: { id: r.id, titulo: r.titulo, estado: r.estado },
      rotulo: 'Autorreporte del paciente',
      dias,
      totales: total,
      cumplimientoDeclarado: vencidas ? Math.round((total.realizadas / vencidas) * 100) : null,
      nota: 'Las tomas sin registro se muestran aparte: no se cuentan como omitidas.',
    };
  }

  /** Resumen de un paciente con el médico: continuidad, lectura, tomas y citas. */
  async dePaciente(actor: UsuarioAutenticado, pacienteId: number) {
    await this.acceso.exigirEscritura(actor, pacienteId);
    await this.auditoria.registrar(actor, Accion.SEGUIMIENTO_LEER, { recurso: 'seguimiento', pacienteId });
    const [hilo] = await this.hilos(actor.id, pacienteId);
    const [lec] = await this.ds.query(
      `SELECT COUNT(*) AS enviadas, SUM(leida_at IS NOT NULL) AS leidas, AVG(TIMESTAMPDIFF(HOUR, created_at, leida_at)) AS horas FROM recomendaciones WHERE doctor_id = ? AND paciente_id = ?`,
      [actor.id, pacienteId],
    );
    const [tom] = await this.ds.query(
      `SELECT SUM(ev.estado = 'REALIZADA') AS realizadas, SUM(ev.estado = 'OMITIDA') AS omitidas, SUM(ev.estado = 'PENDIENTE' AND ev.programado_en < UTC_TIMESTAMP(6)) AS sinRegistro
       FROM eventos_tratamiento ev JOIN recomendaciones r ON r.id = ev.recomendacion_id WHERE r.doctor_id = ? AND ev.paciente_id = ?`,
      [actor.id, pacienteId],
    );
    const citas = await this.ds.query(`SELECT estado, COUNT(*) AS n FROM citas WHERE medico_id = ? AND paciente_id = ? GROUP BY estado`, [actor.id, pacienteId]);
    const n = (e: string) => Number(citas.find((c: any) => c.estado === e)?.n ?? 0);
    return {
      rotulo: 'Los datos de tomas son un autorreporte del paciente.',
      continuidad: hilo ? { estado: hilo.estado, motivo: hilo.motivo, ultimaActividad: hilo.ultimaActividad, diasSinActividad: hilo.diasSinActividad } : null,
      lectura: { enviadas: Number(lec.enviadas), leidas: Number(lec.leidas ?? 0), sinLeer: Number(lec.enviadas) - Number(lec.leidas ?? 0), horasMediasHastaLeer: lec.horas === null ? null : Math.round(Number(lec.horas)) },
      tomas: { realizadas: Number(tom?.realizadas ?? 0), omitidas: Number(tom?.omitidas ?? 0), sinRegistro: Number(tom?.sinRegistro ?? 0) },
      citas: { atendidas: n('ATENDIDA'), noAsistio: n('NO_ASISTIO'), canceladas: n('CANCELADA'), reservadas: n('RESERVADA') + n('EN_ESPERA') },
    };
  }

  // ───────────────────────── Dashboard del centro (administración) ─────────────────────────

  /**
   * Cifras agregadas del centro, sin nombres. Un grupo de menos de 5 personas se muestra como «menos de 5» para
   * que una cifra no identifique a nadie.
   */
  async dashboardCentro(actor: UsuarioAutenticado, especialidad?: number, desde?: string) {
    await this.auditoria.registrar(actor, Accion.SEGUIMIENTO_LEER, { recurso: 'dashboard_centro' });
    const hilos = await this.hilos();
    const [esp] = especialidad ? await this.ds.query('SELECT nombre FROM especialidades WHERE id = ?', [especialidad]) : [null];
    if (especialidad && !esp) throw new BadRequestException('La especialidad no existe');
    const filtrados = hilos.filter((h) => !esp || h.especialidad === esp.nombre);
    const mascara = (n: number) => (n < MINIMO_GRUPO ? { menosDe5: true as const, cantidad: null } : { menosDe5: false as const, cantidad: n });
    const porEspecialidad = new Map<string, Record<EstadoContinuidad, number>>();
    for (const h of filtrados) {
      const clave = h.especialidad ?? 'Sin especialidad';
      const r = porEspecialidad.get(clave) ?? { AL_DIA: 0, EN_RIESGO: 0, DESERTOR: 0, CERRADO: 0 };
      r[h.estado]++;
      porEspecialidad.set(clave, r);
    }
    const desdeFecha = desde ?? sumarDias(hoyLocal(), -30);
    const citas = await this.ds.query(
      `SELECT c.estado, COUNT(*) AS n FROM citas c
       LEFT JOIN perfil_profesional pp ON pp.usuario_id = c.medico_id LEFT JOIN especialidades e ON e.id = pp.especialidad_id
       WHERE c.inicio >= ? ${esp ? 'AND e.nombre = ?' : ''} GROUP BY c.estado`,
      esp ? [inicioDiaUtc(desdeFecha), esp.nombre] : [inicioDiaUtc(desdeFecha)],
    );
    return {
      rotulo: 'Cifras agregadas. Los grupos de menos de 5 personas no se detallan.',
      porEspecialidad: [...porEspecialidad.entries()].map(([nombre, r]) => ({
        especialidad: nombre,
        alDia: mascara(r.AL_DIA),
        enRiesgo: mascara(r.EN_RIESGO),
        desertores: mascara(r.DESERTOR),
        cerrados: mascara(r.CERRADO),
      })),
      citas: citas.map((c: any) => ({ estado: c.estado, ...mascara(Number(c.n)) })),
    };
  }
}
