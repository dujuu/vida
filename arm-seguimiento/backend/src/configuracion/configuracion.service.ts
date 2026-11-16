import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Configuracion } from './configuracion.entity.js';

/** Regla de validación de un parámetro. */
interface Regla {
  tipo: 'entero' | 'booleano' | 'texto';
  min?: number;
  max?: number;
  /** Largo máximo de un texto. */
  largo?: number;
}

/** Parámetros conocidos y su rango válido. Un valor fuera de rango se rechaza antes de guardarlo. */
export const REGLAS: Record<string, Regla> = {
  centro_nombre: { tipo: 'texto', largo: 120 },
  cita_duracion_min: { tipo: 'entero', min: 10, max: 120 },
  cancelacion_horas: { tipo: 'entero', min: 0, max: 168 },
  reserva_antelacion_min_horas: { tipo: 'entero', min: 0, max: 72 },
  reserva_antelacion_max_dias: { tipo: 'entero', min: 1, max: 365 },
  citas_futuras_max: { tipo: 'entero', min: 1, max: 20 },
  sesion_paciente_dias: { tipo: 'entero', min: 1, max: 90 },
  sesion_personal_horas: { tipo: 'entero', min: 1, max: 72 },
  login_intentos_max: { tipo: 'entero', min: 3, max: 20 },
  login_bloqueo_min: { tipo: 'entero', min: 1, max: 240 },
  codigo_vigencia_horas: { tipo: 'entero', min: 1, max: 168 },
  toma_plazo_dias: { tipo: 'entero', min: 0, max: 7 },
  aviso_toma_minutos: { tipo: 'entero', min: 0, max: 240 },
  contactos_tope_salientes: { tipo: 'entero', min: 1, max: 20 },
  continuidad_riesgo_dias: { tipo: 'entero', min: 1, max: 60 },
  continuidad_desercion_dias: { tipo: 'entero', min: 7, max: 365 },
  avisos_tope_diario: { tipo: 'entero', min: 1, max: 50 },
  clave_unica_simulada: { tipo: 'booleano' },
  consentimiento_version: { tipo: 'entero', min: 1, max: 1000 },
};

/** Valores iniciales de respaldo, por si la migración aún no los cargó. */
const DEFECTOS: Record<string, string> = {
  centro_nombre: 'Centro Médico Vida Norte',
  cita_duracion_min: '30',
  cancelacion_horas: '12',
  reserva_antelacion_min_horas: '2',
  reserva_antelacion_max_dias: '60',
  citas_futuras_max: '3',
  sesion_paciente_dias: '30',
  sesion_personal_horas: '12',
  login_intentos_max: '5',
  login_bloqueo_min: '15',
  codigo_vigencia_horas: '48',
  toma_plazo_dias: '1',
  aviso_toma_minutos: '60',
  contactos_tope_salientes: '2',
  continuidad_riesgo_dias: '3',
  continuidad_desercion_dias: '30',
  avisos_tope_diario: '6',
  clave_unica_simulada: '1',
  consentimiento_version: '1',
};

/** Lee y cambia los parámetros del sistema. Mantiene una copia en memoria que se renueva cada 15 segundos. */
@Injectable()
export class ConfiguracionService {
  private cache = new Map<string, string>();
  private cargadoEn = 0;

  constructor(
    @InjectRepository(Configuracion) private readonly repo: Repository<Configuracion>,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async cargar(): Promise<void> {
    if (Date.now() - this.cargadoEn < 15_000 && this.cache.size > 0) return;
    const filas = await this.repo.find();
    this.cache = new Map(filas.map((f) => [f.clave, f.valor]));
    this.cargadoEn = Date.now();
  }

  /** Valor de un parámetro como texto. */
  async texto(clave: string): Promise<string> {
    await this.cargar();
    return this.cache.get(clave) ?? DEFECTOS[clave] ?? '';
  }

  /** Valor de un parámetro numérico. */
  async numero(clave: string): Promise<number> {
    return Number(await this.texto(clave));
  }

  /** Valor de un parámetro de sí o no. */
  async booleano(clave: string): Promise<boolean> {
    return (await this.texto(clave)) === '1';
  }

  /** Todos los parámetros, con su descripción. */
  listar(): Promise<Configuracion[]> {
    return this.repo.find({ order: { clave: 'ASC' } });
  }

  /** Lo único de la configuración que ve una persona sin sesión. */
  async publica(): Promise<{ centroNombre: string; claveUnicaSimulada: boolean }> {
    return {
      centroNombre: await this.texto('centro_nombre'),
      claveUnicaSimulada: await this.booleano('clave_unica_simulada'),
    };
  }

  /**
   * Cambia uno o más parámetros. Valida cada valor contra su rango y deja en auditoría el valor anterior y el nuevo.
   *
   * @throws BadRequestException si una clave no existe o un valor está fuera de rango.
   */
  async actualizar(actor: UsuarioAutenticado, valores: Record<string, string | number | boolean>): Promise<Configuracion[]> {
    const errores: string[] = [];
    const normalizados: Record<string, string> = {};
    for (const [clave, bruto] of Object.entries(valores)) {
      const regla = REGLAS[clave];
      if (!regla) {
        errores.push(`El parámetro ${clave} no existe`);
        continue;
      }
      const valor = typeof bruto === 'boolean' ? (bruto ? '1' : '0') : String(bruto).trim();
      if (regla.tipo === 'entero') {
        const n = Number(valor);
        if (!/^\d+$/.test(valor) || n < (regla.min ?? 0) || n > (regla.max ?? Number.MAX_SAFE_INTEGER)) {
          errores.push(`${clave} debe ser un número entero entre ${regla.min} y ${regla.max}`);
          continue;
        }
      } else if (regla.tipo === 'booleano') {
        if (valor !== '0' && valor !== '1') {
          errores.push(`${clave} debe ser 0 o 1`);
          continue;
        }
      } else if (valor.length === 0 || valor.length > (regla.largo ?? 200)) {
        errores.push(`${clave} debe tener entre 1 y ${regla.largo} caracteres`);
        continue;
      }
      normalizados[clave] = valor;
    }
    if (errores.length > 0) throw new BadRequestException(errores);

    for (const [clave, valor] of Object.entries(normalizados)) {
      const anterior = await this.texto(clave);
      await this.repo.update({ clave }, { valor, modificadoPor: actor.id });
      await this.auditoria.registrar(actor, Accion.CONFIGURACION_EDITAR, {
        recurso: 'configuracion',
        recursoId: clave,
        detalle: `${anterior} -> ${valor}`,
      });
    }
    this.cargadoEn = 0;
    return this.listar();
  }
}
