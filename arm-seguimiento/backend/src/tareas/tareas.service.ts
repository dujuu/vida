import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CalendarioService } from '../calendario/calendario.service.js';
import { CitasService } from '../citas/citas.service.js';
import { hoyLocal, sumarDias, utcALocal } from '../common/fechas.util.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { RecomendacionesService } from '../recomendaciones/recomendaciones.service.js';

/**
 * Tareas periódicas dentro del mismo proceso (no hacen falta colas ni servicios extra mientras haya una sola instancia).
 *
 * - Cada 10 minutos: avisos de cita (la víspera y el mismo día).
 * - Una vez al día: marca inasistencias, extiende el horizonte de tomas de tratamientos largos, finaliza indicaciones
 *   vencidas y limpia datos vencidos (códigos, sesiones, intentos de login, avisos de más de 90 días).
 *
 * Se desactivan con `TAREAS=off` (por ejemplo, en las pruebas).
 */
@Injectable()
export class TareasService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Tareas');
  private temporizador: NodeJS.Timeout | null = null;
  private ultimoDia = '';
  private corriendo = false;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly citas: CitasService,
    private readonly calendario: CalendarioService,
    private readonly recomendaciones: RecomendacionesService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.TAREAS === 'off') return;
    this.temporizador = setInterval(() => void this.ciclo(), 10 * 60_000);
    setTimeout(() => void this.ciclo(), 20_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  /** Un ciclo: avisos de cita y, si cambió el día, las tareas diarias. */
  async ciclo(): Promise<void> {
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      await this.recordatoriosDeCita();
      const hoy = hoyLocal();
      if (hoy !== this.ultimoDia) {
        await this.diarias();
        this.ultimoDia = hoy;
      }
    } catch (e) {
      this.log.error(`Falló un ciclo de tareas: ${(e as Error).message}`);
    } finally {
      this.corriendo = false;
    }
  }

  /** Avisa a los pacientes de sus citas de mañana y de hoy, una sola vez por cita y tipo. */
  async recordatoriosDeCita(): Promise<number> {
    const hoy = hoyLocal();
    const manana = sumarDias(hoy, 1);
    const citas: Array<{ id: number; pacienteId: number; inicio: Date }> = await this.ds.query(
      `SELECT id, paciente_id AS pacienteId, inicio FROM citas
       WHERE estado = 'RESERVADA' AND inicio > UTC_TIMESTAMP(6) AND inicio < (UTC_TIMESTAMP(6) + INTERVAL 48 HOUR)`,
    );
    let creados = 0;
    for (const c of citas) {
      const fecha = utcALocal(new Date(c.inicio)).fecha;
      const tipo = fecha === hoy ? 'CITA_RECORDATORIO_HOY' : fecha === manana ? 'CITA_RECORDATORIO_VISPERA' : null;
      if (!tipo) continue;
      const enlace = `/paciente/horas?cita=${c.id}`;
      const [ya] = await this.ds.query('SELECT 1 AS ok FROM notificaciones WHERE usuario_id = ? AND tipo = ? AND enlace = ? LIMIT 1', [c.pacienteId, tipo, enlace]);
      if (ya) continue;
      const hecho = await this.notificaciones.crear(
        c.pacienteId,
        tipo,
        tipo === 'CITA_RECORDATORIO_HOY' ? 'Tiene una cita hoy' : 'Tiene una cita mañana',
        'Revise la hora y el médico en su agenda.',
        enlace,
      );
      if (hecho) creados++;
    }
    return creados;
  }

  /** Tareas de una vez al día. */
  async diarias(): Promise<void> {
    const inasistencias = await this.citas.marcarInasistencias();
    const tomas = await this.calendario.extenderHorizonte();
    const finalizadas = await this.recomendaciones.finalizarVencidas();
    await this.ds.query(`DELETE FROM intentos_login WHERE created_at < (UTC_TIMESTAMP(6) - INTERVAL 7 DAY)`);
    await this.ds.query(`DELETE FROM codigos_acceso WHERE expira_en < (UTC_TIMESTAMP(6) - INTERVAL 30 DAY)`);
    await this.ds.query(`DELETE FROM sesiones WHERE expira_en < (UTC_TIMESTAMP(6) - INTERVAL 30 DAY) OR revocada_en < (UTC_TIMESTAMP(6) - INTERVAL 30 DAY)`);
    await this.ds.query(`DELETE FROM notificaciones WHERE created_at < (UTC_TIMESTAMP(6) - INTERVAL 90 DAY)`);
    this.log.log(`Tareas diarias: ${inasistencias} inasistencias, ${tomas} tomas generadas, ${finalizadas} indicaciones finalizadas`);
  }
}
