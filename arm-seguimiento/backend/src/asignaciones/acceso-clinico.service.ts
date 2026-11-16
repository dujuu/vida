import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../usuarios/rol.enum.js';
import { DoctorPaciente } from './doctor-paciente.entity.js';

/** Alcance de lectura que se concede sobre la ficha de un paciente. */
export interface AlcanceLectura {
  /** Verdadero si la relación con el paciente está cerrada: solo puede leer lo que él mismo escribió. */
  soloPropio: boolean;
}

/**
 * Función única que decide quién puede abrir la ficha clínica de quién. Todos los módulos clínicos la llaman;
 * ninguno repite la regla.
 *
 * - El paciente lee lo suyo.
 * - El médico lee y escribe solo si tiene una relación vigente con el paciente. Con la relación cerrada conserva
 *   lectura de lo que él escribió.
 * - Recepción y administración nunca acceden a datos clínicos.
 *
 * Un recurso ajeno responde 404 (no se confirma que exista); un rol sin permiso responde 403.
 */
@Injectable()
export class AccesoClinicoService {
  constructor(@InjectRepository(DoctorPaciente) private readonly relaciones: Repository<DoctorPaciente>) {}

  /** Relación entre un médico y un paciente, vigente o cerrada. */
  relacion(medicoId: number, pacienteId: number): Promise<DoctorPaciente | null> {
    return this.relaciones.findOneBy({ doctorId: medicoId, pacienteId });
  }

  /**
   * Exige que el actor pueda leer datos clínicos del paciente.
   *
   * @throws ForbiddenException si el rol activo no es clínico.
   * @throws NotFoundException si no tiene relación con el paciente o el paciente es otra persona.
   */
  async exigirLectura(actor: Pick<UsuarioAutenticado, 'id' | 'rol'>, pacienteId: number): Promise<AlcanceLectura> {
    if (actor.rol === Rol.PACIENTE) {
      if (actor.id !== pacienteId) throw new NotFoundException('Paciente no encontrado');
      return { soloPropio: false };
    }
    if (actor.rol !== Rol.MEDICO) throw new ForbiddenException('No tiene permisos para ver información clínica');
    if (actor.id === pacienteId) throw new NotFoundException('Paciente no encontrado');
    const rel = await this.relacion(actor.id, pacienteId);
    if (!rel) throw new NotFoundException('Paciente no encontrado');
    return { soloPropio: !rel.vigente };
  }

  /**
   * Exige que el actor pueda escribir datos clínicos del paciente: solo un médico con relación vigente.
   *
   * @throws ForbiddenException si el rol activo no es médico.
   * @throws NotFoundException si no tiene relación vigente con el paciente.
   */
  async exigirEscritura(actor: Pick<UsuarioAutenticado, 'id' | 'rol'>, pacienteId: number): Promise<void> {
    if (actor.rol !== Rol.MEDICO) throw new ForbiddenException('No tiene permisos para registrar información clínica');
    if (actor.id === pacienteId) throw new NotFoundException('Paciente no encontrado');
    const rel = await this.relacion(actor.id, pacienteId);
    if (!rel || !rel.vigente) throw new NotFoundException('Paciente no encontrado');
  }
}
