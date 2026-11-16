import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CodigosService } from '../auth/codigos.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { armarPagina, desplazamiento, type Pagina } from '../common/paginacion.js';
import { formatearRut, normalizarRut } from '../common/rut.util.js';
import { PerfilPaciente } from '../pacientes/pacientes.entities.js';
import { Especialidad, PerfilProfesional } from '../profesionales/profesionales.entities.js';
import type { AsignarRolesDto, CrearUsuarioDto, DatosPersonalesDto, FiltroUsuariosDto, PerfilProfesionalDto } from './usuarios.dto.js';
import { Rol } from './rol.enum.js';
import { Usuario, UsuarioRol } from './usuario.entity.js';

/** Usuario tal como lo ve el administrador. */
export interface UsuarioAdmin {
  id: number;
  rut: string;
  titulo: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  activo: boolean;
  sinActivar: boolean;
  roles: Rol[];
  ultimoAcceso: Date | null;
  especialidad: string | null;
}

/** Resultado de crear un usuario: el usuario y, si hace falta, su código de activación (única vez que se muestra). */
export interface UsuarioCreado {
  usuario: UsuarioAdmin;
  /** Código de activación en claro. Nulo si la persona ya tenía contraseña. */
  codigo: string | null;
  venceEn: Date | null;
  /** Verdadero si el RUT ya existía y solo se agregaron roles. */
  existente: boolean;
}

/** Escapa los comodines de LIKE de un texto que escribió una persona. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Altas, bajas, roles y códigos de acceso de las personas del sistema. Lo usa el administrador; recepción
 * registra pacientes por el módulo de pacientes.
 */
@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioRol) private readonly rolesRepo: Repository<UsuarioRol>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly codigos: CodigosService,
    private readonly auth: AuthService,
  ) {}

  /** Nombres para mostrar de varios usuarios, por id. */
  async nombres(ids: number[]): Promise<Map<number, string>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const filas = await this.usuarios.find({ where: { id: In(unicos) } });
    return new Map(filas.map((u) => [u.id, u.nombre]));
  }

  /** Detalle administrativo de un usuario. @throws NotFoundException si no existe. */
  async detalle(id: number): Promise<UsuarioAdmin> {
    const u = await this.usuarios.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id }).getOne();
    if (!u) throw new NotFoundException('Usuario no encontrado');
    const roles = (await this.rolesRepo.find({ where: { usuarioId: id } })).map((r) => r.rol);
    const [esp] = await this.ds.query(
      `SELECT e.nombre FROM perfil_profesional p JOIN especialidades e ON e.id = p.especialidad_id WHERE p.usuario_id = ?`,
      [id],
    );
    return {
      id: u.id,
      rut: formatearRut(u.rut),
      titulo: u.titulo,
      nombres: u.nombres,
      apellidoPaterno: u.apellidoPaterno,
      apellidoMaterno: u.apellidoMaterno,
      nombre: u.nombre,
      correo: u.correo,
      telefono: u.telefono,
      activo: u.activo,
      sinActivar: !u.passwordHash,
      roles,
      ultimoAcceso: u.ultimoAcceso,
      especialidad: esp?.nombre ?? null,
    };
  }

  /** Lista usuarios con filtros por rol, estado y texto. */
  async listar(f: FiltroUsuariosDto): Promise<Pagina<Omit<UsuarioAdmin, 'especialidad'>>> {
    const cond: string[] = ['1 = 1'];
    const params: unknown[] = [];
    if (f.rol) (cond.push('EXISTS (SELECT 1 FROM usuario_rol x WHERE x.usuario_id = u.id AND x.rol = ?)'), params.push(f.rol));
    if (f.estado) cond.push(f.estado === 'activos' ? 'u.activo = 1' : 'u.activo = 0');
    if (f.buscar) {
      const like = `%${escaparLike(f.buscar)}%`;
      const rutLimpio = f.buscar.replace(/[.\-\s]/g, '');
      cond.push(`(CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno) LIKE ? OR u.rut LIKE ?)`);
      params.push(like, `%${escaparLike(rutLimpio)}%`);
    }
    const where = cond.join(' AND ');
    const [{ total }] = await this.ds.query(`SELECT COUNT(*) AS total FROM usuarios u WHERE ${where}`, params);
    const filas = await this.ds.query(
      `SELECT u.id, u.rut, u.titulo, u.nombres, u.apellido_paterno AS apellidoPaterno, u.apellido_materno AS apellidoMaterno,
              u.correo, u.telefono, u.activo, u.ultimo_acceso AS ultimoAcceso, (u.password_hash IS NULL) AS sinActivar,
              (SELECT GROUP_CONCAT(rol) FROM usuario_rol r WHERE r.usuario_id = u.id) AS roles
       FROM usuarios u WHERE ${where} ORDER BY u.apellido_paterno, u.nombres LIMIT ? OFFSET ?`,
      [...params, f.tamano, desplazamiento(f)],
    );
    const items = filas.map((r: any) => ({
      id: r.id,
      rut: formatearRut(r.rut),
      titulo: r.titulo,
      nombres: r.nombres,
      apellidoPaterno: r.apellidoPaterno,
      apellidoMaterno: r.apellidoMaterno,
      nombre: [r.titulo, r.nombres, r.apellidoPaterno, r.apellidoMaterno].filter((x: string | null) => !!x).join(' '),
      correo: r.correo,
      telefono: r.telefono,
      activo: !!r.activo,
      sinActivar: !!r.sinActivar,
      roles: r.roles ? (r.roles.split(',') as Rol[]) : [],
      ultimoAcceso: r.ultimoAcceso,
    }));
    return armarPagina(items, Number(total), f);
  }

  /** Guarda o actualiza el perfil profesional de un médico, validando la especialidad. */
  async guardarPerfilProfesional(m: EntityManager, usuarioId: number, dto: PerfilProfesionalDto): Promise<void> {
    const esp = await m.findOneBy(Especialidad, { id: dto.especialidadId });
    if (!esp || !esp.activa) throw new BadRequestException('La especialidad no existe o está desactivada');
    const actual = await m.findOneBy(PerfilProfesional, { usuarioId });
    if (actual) {
      await m.update(PerfilProfesional, { usuarioId }, {
        especialidadId: dto.especialidadId,
        registroProfesional: dto.registroProfesional ?? actual.registroProfesional,
        duracionCitaMin: dto.duracionCitaMin ?? actual.duracionCitaMin,
        aceptaReservas: dto.aceptaReservas ?? actual.aceptaReservas,
        presentacion: dto.presentacion ?? actual.presentacion,
      });
    } else {
      await m.insert(PerfilProfesional, {
        usuarioId,
        especialidadId: dto.especialidadId,
        registroProfesional: dto.registroProfesional ?? null,
        duracionCitaMin: dto.duracionCitaMin ?? 30,
        aceptaReservas: dto.aceptaReservas ?? true,
        presentacion: dto.presentacion ?? null,
      });
    }
  }

  /**
   * Crea una persona del personal. Si el RUT ya existe, agrega los roles a la misma persona en vez de crear otra.
   * Si no tiene contraseña, genera un código de activación.
   */
  async crear(actor: UsuarioAutenticado, dto: CrearUsuarioDto): Promise<UsuarioCreado> {
    const rut = normalizarRut(dto.rut);
    if (!rut) throw new BadRequestException('El RUT ingresado no es válido');
    if (dto.roles.includes(Rol.MEDICO) && !dto.perfilProfesional) {
      throw new BadRequestException('Para el rol médico debe completar el perfil profesional');
    }
    const resultado = await this.ds.transaction(async (m) => {
      let u = await m.findOneBy(Usuario, { rut });
      const existente = !!u;
      if (u && !u.activo) throw new ConflictException('Esa persona existe pero está desactivada. Actívela desde la lista de usuarios.');
      if (!u) {
        u = await m.save(
          m.create(Usuario, {
            rut,
            titulo: dto.titulo ?? null,
            nombres: dto.nombres,
            apellidoPaterno: dto.apellidoPaterno,
            apellidoMaterno: dto.apellidoMaterno ?? null,
            correo: dto.correo ?? null,
            telefono: dto.telefono ?? null,
            activo: true,
            passwordHash: null,
          }),
        );
      }
      const tiene = new Set((await m.find(UsuarioRol, { where: { usuarioId: u.id } })).map((r) => r.rol));
      for (const rol of dto.roles) {
        if (!tiene.has(rol)) await m.insert(UsuarioRol, { usuarioId: u.id, rol, asignadoPor: actor.id });
      }
      if (dto.roles.includes(Rol.MEDICO) && dto.perfilProfesional) await this.guardarPerfilProfesional(m, u.id, dto.perfilProfesional);
      if (dto.roles.includes(Rol.PACIENTE) && !(await m.existsBy(PerfilPaciente, { usuarioId: u.id }))) {
        await m.insert(PerfilPaciente, { usuarioId: u.id, registradoPor: actor.id });
      }
      const [{ sinPassword }] = await m.query('SELECT (password_hash IS NULL) AS sinPassword FROM usuarios WHERE id = ?', [u.id]);
      const emitido = sinPassword ? await this.codigos.emitir(u.id, 'ACTIVACION', actor.id, m) : null;
      await this.auditoria.registrar(actor, existente ? Accion.USUARIO_ROLES : Accion.USUARIO_CREAR, {
        recurso: 'usuario',
        recursoId: u.id,
        detalle: dto.roles.join(','),
      }, m);
      return { id: u.id, existente, emitido };
    });
    return {
      usuario: await this.detalle(resultado.id),
      codigo: resultado.emitido?.codigo ?? null,
      venceEn: resultado.emitido?.venceEn ?? null,
      existente: resultado.existente,
    };
  }

  /** Modifica datos administrativos. El RUT no se puede cambiar. */
  async editar(actor: UsuarioAutenticado, id: number, dto: DatosPersonalesDto): Promise<UsuarioAdmin> {
    await this.detalle(id);
    const cambios: Partial<Usuario> = {};
    if (dto.titulo !== undefined) cambios.titulo = dto.titulo || null;
    if (dto.nombres !== undefined) cambios.nombres = dto.nombres;
    if (dto.apellidoPaterno !== undefined) cambios.apellidoPaterno = dto.apellidoPaterno;
    if (dto.apellidoMaterno !== undefined) cambios.apellidoMaterno = dto.apellidoMaterno || null;
    if (dto.correo !== undefined) cambios.correo = dto.correo || null;
    if (dto.telefono !== undefined) cambios.telefono = dto.telefono || null;
    if (Object.keys(cambios).length > 0) await this.usuarios.update({ id }, cambios);
    await this.auditoria.registrar(actor, Accion.USUARIO_EDITAR, { recurso: 'usuario', recursoId: id, detalle: Object.keys(cambios).join(',') });
    return this.detalle(id);
  }

  /** Cuántos administradores activos hay. */
  private async administradoresActivos(): Promise<number> {
    const [{ n }] = await this.ds.query(
      `SELECT COUNT(*) AS n FROM usuario_rol r JOIN usuarios u ON u.id = r.usuario_id WHERE r.rol = 'ADMINISTRADOR' AND u.activo = 1`,
    );
    return Number(n);
  }

  /**
   * Reemplaza los roles de un usuario.
   *
   * @throws ForbiddenException si un administrador intenta quitarse a sí mismo el rol de administrador.
   * @throws BadRequestException si quedaría sin administradores o falta el perfil profesional de un médico.
   */
  async asignarRoles(actor: UsuarioAutenticado, id: number, dto: AsignarRolesDto): Promise<UsuarioAdmin> {
    const antes = await this.detalle(id);
    if (id === actor.id && !dto.roles.includes(Rol.ADMINISTRADOR)) {
      throw new ForbiddenException('No puede quitarse a sí mismo el rol de administrador');
    }
    if (antes.roles.includes(Rol.ADMINISTRADOR) && !dto.roles.includes(Rol.ADMINISTRADOR) && antes.activo && (await this.administradoresActivos()) <= 1) {
      throw new BadRequestException('Debe quedar al menos un administrador activo');
    }
    await this.ds.transaction(async (m) => {
      if (dto.roles.includes(Rol.MEDICO)) {
        if (dto.perfilProfesional) await this.guardarPerfilProfesional(m, id, dto.perfilProfesional);
        else if (!(await m.existsBy(PerfilProfesional, { usuarioId: id }))) {
          throw new BadRequestException('Para el rol médico debe completar el perfil profesional');
        }
      }
      if (dto.roles.includes(Rol.PACIENTE) && !(await m.existsBy(PerfilPaciente, { usuarioId: id }))) {
        await m.insert(PerfilPaciente, { usuarioId: id, registradoPor: actor.id });
      }
      await m.delete(UsuarioRol, { usuarioId: id });
      for (const rol of dto.roles) await m.insert(UsuarioRol, { usuarioId: id, rol, asignadoPor: actor.id });
      await this.auditoria.registrar(actor, Accion.USUARIO_ROLES, {
        recurso: 'usuario',
        recursoId: id,
        detalle: `${antes.roles.join(',')} -> ${dto.roles.join(',')}`,
      }, m);
    });
    return this.detalle(id);
  }

  /** Activa o desactiva una cuenta. Desactivar corta el acceso de inmediato y cierra sus sesiones. */
  async cambiarEstado(actor: UsuarioAutenticado, id: number, activo: boolean): Promise<UsuarioAdmin> {
    const u = await this.detalle(id);
    if (!activo) {
      if (id === actor.id) throw new ForbiddenException('No puede desactivar su propia cuenta');
      if (u.roles.includes(Rol.ADMINISTRADOR) && u.activo && (await this.administradoresActivos()) <= 1) {
        throw new BadRequestException('Debe quedar al menos un administrador activo');
      }
    }
    await this.usuarios.update({ id }, { activo });
    if (!activo) await this.auth.revocarSesionesDe(id);
    await this.auditoria.registrar(actor, Accion.USUARIO_ESTADO, { recurso: 'usuario', recursoId: id, detalle: activo ? 'activar' : 'desactivar' });
    return this.detalle(id);
  }

  /**
   * Emite un código para que la persona (re)active su cuenta y cierra sus sesiones. El administrador nunca
   * conoce la contraseña: solo entrega el código en persona, y la emisión queda en auditoría.
   */
  async emitirCodigo(actor: UsuarioAutenticado, id: number): Promise<{ codigo: string; venceEn: Date; tipo: 'ACTIVACION' | 'RECUPERACION' }> {
    const u = await this.detalle(id);
    if (!u.activo) throw new BadRequestException('La cuenta está desactivada');
    const tipo = u.sinActivar ? 'ACTIVACION' : 'RECUPERACION';
    const r = await this.codigos.emitir(id, tipo, actor.id);
    if (tipo === 'RECUPERACION') await this.auth.revocarSesionesDe(id);
    await this.auditoria.registrar(actor, Accion.CODIGO_EMITIR, { recurso: 'usuario', recursoId: id, detalle: tipo });
    return { ...r, tipo };
  }
}
