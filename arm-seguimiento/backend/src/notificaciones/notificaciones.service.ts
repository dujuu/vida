import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { aMinutos, hoyLocal, inicioDiaUtc, REGEX_HORA, sumarDias, utcALocal } from '../common/fechas.util.js';
import { armarPagina, desplazamiento, type PaginacionDto, type Pagina } from '../common/paginacion.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Rol } from '../usuarios/rol.enum.js';
import { Notificacion, PreferenciaAviso } from './notificaciones.entities.js';

/** Tipos de aviso que siempre llegan, aunque se supere el tope diario o el paciente silencie los avisos de citas. */
const SIEMPRE = ['INDICACION_NUEVA', 'INDICACION_MODIFICADA', 'INDICACION_SUSPENDIDA', 'CUENTA'];

/**
 * Bandeja de avisos dentro de la aplicación. Ningún otro módulo le habla al usuario directamente: todos piden
 * a este servicio que cree el aviso. El texto nunca lleva datos clínicos.
 */
@Injectable()
export class NotificacionesService {
  constructor(
    @InjectRepository(Notificacion) private readonly repo: Repository<Notificacion>,
    @InjectRepository(PreferenciaAviso) private readonly prefs: Repository<PreferenciaAviso>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly config: ConfiguracionService,
  ) {}

  /**
   * Crea un aviso para un usuario, respetando sus preferencias y el tope diario de avisos.
   *
   * @param manager Gestor de transacción, si se crea dentro de otra operación.
   * @returns `true` si se creó, `false` si se omitió por preferencias o tope.
   */
  async crear(
    usuarioId: number,
    tipo: string,
    titulo: string,
    texto: string,
    enlace: string | null = null,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(Notificacion) : this.repo;
    if (!SIEMPRE.includes(tipo)) {
      const p = await (manager ? manager.getRepository(PreferenciaAviso) : this.prefs).findOneBy({ usuarioId });
      if (tipo.startsWith('CITA') && p && !p.avisosCitas) return false;
      const tope = await this.config.numero('avisos_tope_diario');
      const desde = inicioDiaUtc(hoyLocal());
      const hoy = await repo.createQueryBuilder('n').where('n.usuario_id = :usuarioId AND n.created_at >= :desde', { usuarioId, desde }).getCount();
      if (hoy >= tope) return false;
    }
    await repo.insert({ usuarioId, tipo, titulo, texto, enlace });
    return true;
  }

  /** Bandeja del usuario, de la más nueva a la más antigua. */
  async listar(usuarioId: number, soloNoLeidas: boolean, pag: PaginacionDto): Promise<Pagina<Notificacion>> {
    const where = soloNoLeidas ? { usuarioId, leidaEn: IsNull() } : { usuarioId };
    const [items, total] = await this.repo.findAndCount({ where, order: { createdAt: 'DESC', id: 'DESC' }, take: pag.tamano, skip: desplazamiento(pag) });
    return armarPagina(items, total, pag);
  }

  /**
   * Resumen liviano que la pantalla consulta periódicamente: avisos sin leer y, para el paciente, las tomas por
   * vencer y atrasadas. La pantalla solo recarga datos cuando este resumen cambia.
   */
  async resumen(actor: UsuarioAutenticado) {
    const sinLeer = await this.repo.countBy({ usuarioId: actor.id, leidaEn: IsNull() });
    let tomasPorVencer = 0;
    let tomasAtrasadas = 0;
    if (actor.rol === Rol.PACIENTE) {
      const minutos = await this.config.numero('aviso_toma_minutos');
      const plazoDias = await this.config.numero('toma_plazo_dias');
      const ahora = new Date();
      const limiteAtraso = inicioDiaUtc(sumarDias(hoyLocal(), -plazoDias));
      const [fila] = await this.ds.query(
        `SELECT SUM(programado_en >= ? AND programado_en <= ?) AS porVencer, SUM(programado_en < ? AND programado_en >= ?) AS atrasadas
         FROM eventos_tratamiento WHERE paciente_id = ? AND estado = 'PENDIENTE'`,
        [ahora, new Date(ahora.getTime() + minutos * 60_000), ahora, limiteAtraso, actor.id],
      );
      tomasPorVencer = Number(fila?.porVencer ?? 0);
      tomasAtrasadas = Number(fila?.atrasadas ?? 0);
    }
    return { sinLeer, tomasPorVencer, tomasAtrasadas };
  }

  /** Marca un aviso propio como leído. */
  async marcarLeida(usuarioId: number, id: string): Promise<void> {
    await this.repo.update({ id, usuarioId, leidaEn: IsNull() }, { leidaEn: new Date() });
  }

  /** Marca todos los avisos propios como leídos. */
  async leerTodas(usuarioId: number): Promise<void> {
    await this.repo.update({ usuarioId, leidaEn: IsNull() }, { leidaEn: new Date() });
  }

  /** Preferencias del usuario; si nunca las cambió, los valores por defecto. */
  async preferencias(usuarioId: number): Promise<PreferenciaAviso> {
    return (await this.prefs.findOneBy({ usuarioId })) ?? this.prefs.create({ usuarioId, avisosTomas: true, avisosCitas: true, silencioDesde: null, silencioHasta: null });
  }

  /** Cambia las preferencias de aviso. El horario de silencio debe tener ambas horas o ninguna. */
  async guardarPreferencias(
    usuarioId: number,
    d: { avisosTomas?: boolean; avisosCitas?: boolean; silencioDesde?: string | null; silencioHasta?: string | null },
  ): Promise<PreferenciaAviso> {
    const actual = await this.preferencias(usuarioId);
    const desde = d.silencioDesde === undefined ? actual.silencioDesde : d.silencioDesde;
    const hasta = d.silencioHasta === undefined ? actual.silencioHasta : d.silencioHasta;
    if ((desde && !hasta) || (!desde && hasta)) throw new BadRequestException('El horario de silencio necesita hora de inicio y de término');
    if (desde && hasta && (!REGEX_HORA.test(desde) || !REGEX_HORA.test(hasta))) throw new BadRequestException('Las horas deben tener formato HH:mm');
    await this.prefs.save({
      usuarioId,
      avisosTomas: d.avisosTomas ?? actual.avisosTomas,
      avisosCitas: d.avisosCitas ?? actual.avisosCitas,
      silencioDesde: desde || null,
      silencioHasta: hasta || null,
    });
    return this.preferencias(usuarioId);
  }

  /** Verdadero si la hora local actual cae dentro del horario de silencio del usuario. */
  enSilencio(p: Pick<PreferenciaAviso, 'silencioDesde' | 'silencioHasta'>, ahora: Date = new Date()): boolean {
    if (!p.silencioDesde || !p.silencioHasta) return false;
    const m = aMinutos(utcALocal(ahora).hora);
    const a = aMinutos(p.silencioDesde);
    const b = aMinutos(p.silencioHasta);
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }
}
