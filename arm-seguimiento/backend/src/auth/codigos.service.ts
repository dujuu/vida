import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { CodigoAcceso } from './auth.entities.js';
import { generarCodigo, normalizarCodigo, sha256 } from './seguridad.util.js';

/** Emite y consume códigos de un solo uso para activar una cuenta o recuperar el acceso. */
@Injectable()
export class CodigosService {
  constructor(
    @InjectRepository(CodigoAcceso) private readonly codigos: Repository<CodigoAcceso>,
    private readonly config: ConfiguracionService,
  ) {}

  /**
   * Emite un código nuevo y anula los anteriores sin usar del mismo usuario.
   *
   * @returns El código en claro (única vez que existe así) y su vencimiento.
   */
  async emitir(
    usuarioId: number,
    tipo: 'ACTIVACION' | 'RECUPERACION',
    emitidoPor: number | null,
    manager?: EntityManager,
  ): Promise<{ codigo: string; venceEn: Date }> {
    const repo = manager ? manager.getRepository(CodigoAcceso) : this.codigos;
    await repo.delete({ usuarioId, usadoEn: IsNull() });
    const codigo = generarCodigo();
    const horas = await this.config.numero('codigo_vigencia_horas');
    const venceEn = new Date(Date.now() + horas * 3_600_000);
    await repo.insert({ usuarioId, tipo, codigoHash: sha256(normalizarCodigo(codigo)), expiraEn: venceEn, emitidoPor });
    return { codigo, venceEn };
  }

  /** Busca un código vigente y sin usar de un usuario. Devuelve `null` si no existe, venció o ya se usó. */
  async buscarVigente(usuarioId: number, codigoEscrito: string): Promise<CodigoAcceso | null> {
    const fila = await this.codigos.findOneBy({
      usuarioId,
      codigoHash: sha256(normalizarCodigo(codigoEscrito)),
      usadoEn: IsNull(),
    });
    return fila && fila.expiraEn.getTime() > Date.now() ? fila : null;
  }

  /** Marca un código como usado. */
  async consumir(id: number): Promise<void> {
    await this.codigos.update({ id }, { usadoEn: new Date() });
  }
}
