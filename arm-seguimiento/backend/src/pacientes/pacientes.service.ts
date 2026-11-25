import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import { CodigosService } from '../auth/codigos.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { armarPagina, desplazamiento, type Pagina } from '../common/paginacion.js';
import { formatearRut, normalizarRut } from '../common/rut.util.js';
import { hoyLocal } from '../common/fechas.util.js';
import { fechaMinimaNacimiento } from '../common/validaciones.js';
import { Rol } from '../usuarios/rol.enum.js';
import { Usuario, UsuarioRol } from '../usuarios/usuario.entity.js';
import { escaparLike } from '../usuarios/usuarios.service.js';
import type { ContactoPacienteDto, CrearPacienteDto, EditarPacienteDto, FiltroPacientesDto, FusionarPacientesDto } from './pacientes.dto.js';
import { Consentimiento, PerfilPaciente } from './pacientes.entities.js';

/** Ficha administrativa de un paciente. Nunca incluye datos clínicos. */
export interface PacienteAdmin {
  id: number;
  rut: string;
  nombre: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  telefono: string | null;
  correo: string | null;
  activo: boolean;
  sinActivar: boolean;
  fechaNacimiento: string | null;
  sexo: 'F' | 'M' | 'O' | null;
  direccion: string | null;
  comuna: string | null;
  emergenciaNombre: string | null;
  emergenciaTelefono: string | null;
  emergenciaParentesco: string | null;
  medioContacto: 'LLAMADA' | 'WHATSAPP' | 'CORREO' | null;
  aceptaRecordatorios: boolean;
  consentimiento: { version: number; aceptadoEn: Date; medio: string } | null;
}

/**
 * Valida una fecha de nacimiento `AAAA-MM-DD`: existe, no es futura y no supera los 130 años de edad.
 *
 * @param fecha Fecha a validar.
 * @param hoy Fecha de hoy en el centro; se puede pasar para probar la función.
 */
export function fechaNacimientoValida(fecha: string, hoy: string = hoyLocal()): boolean {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) return false;
  return fecha >= fechaMinimaNacimiento(hoy) && fecha <= hoy;
}

/** Registro administrativo de pacientes: alta, búsqueda, contacto, duplicados y fusión. */
@Injectable()
export class PacientesService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(PerfilPaciente) private readonly perfiles: Repository<PerfilPaciente>,
    @InjectRepository(Consentimiento) private readonly consentimientos: Repository<Consentimiento>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly codigos: CodigosService,
    private readonly auth: AuthService,
    private readonly config: ConfiguracionService,
  ) {}

  private static readonly SELECT = `
    SELECT u.id, u.rut, u.titulo, u.nombres, u.apellido_paterno AS apellidoPaterno, u.apellido_materno AS apellidoMaterno,
           u.telefono, u.correo, u.activo, (u.password_hash IS NULL) AS sinActivar,
           pp.fecha_nacimiento AS fechaNacimiento, pp.sexo, pp.direccion, pp.comuna,
           pp.emergencia_nombre AS emergenciaNombre, pp.emergencia_telefono AS emergenciaTelefono,
           pp.emergencia_parentesco AS emergenciaParentesco, pp.medio_contacto AS medioContacto,
           pp.acepta_recordatorios AS aceptaRecordatorios
    FROM usuarios u
    JOIN usuario_rol r ON r.usuario_id = u.id AND r.rol = 'PACIENTE'
    LEFT JOIN perfil_paciente pp ON pp.usuario_id = u.id`;

  private async mapear(f: any): Promise<PacienteAdmin> {
    const c = await this.consentimientos.findOne({ where: { pacienteId: f.id }, order: { aceptadoEn: 'DESC' } });
    return {
      id: f.id,
      rut: formatearRut(f.rut),
      nombre: [f.nombres, f.apellidoPaterno, f.apellidoMaterno].filter((x: string | null) => !!x).join(' '),
      nombres: f.nombres,
      apellidoPaterno: f.apellidoPaterno,
      apellidoMaterno: f.apellidoMaterno,
      telefono: f.telefono,
      correo: f.correo,
      activo: !!f.activo,
      sinActivar: !!f.sinActivar,
      fechaNacimiento: f.fechaNacimiento instanceof Date ? f.fechaNacimiento.toISOString().slice(0, 10) : (f.fechaNacimiento ?? null),
      sexo: f.sexo ?? null,
      direccion: f.direccion ?? null,
      comuna: f.comuna ?? null,
      emergenciaNombre: f.emergenciaNombre ?? null,
      emergenciaTelefono: f.emergenciaTelefono ?? null,
      emergenciaParentesco: f.emergenciaParentesco ?? null,
      medioContacto: f.medioContacto ?? null,
      aceptaRecordatorios: f.aceptaRecordatorios === null || f.aceptaRecordatorios === undefined ? true : !!f.aceptaRecordatorios,
      consentimiento: c ? { version: c.version, aceptadoEn: c.aceptadoEn, medio: c.medio } : null,
    };
  }

  /** Ficha administrativa de un paciente. @throws NotFoundException si no existe. */
  async detalle(id: number): Promise<PacienteAdmin> {
    const [f] = await this.ds.query(`${PacientesService.SELECT} WHERE u.id = ?`, [id]);
    if (!f) throw new NotFoundException('Paciente no encontrado');
    return this.mapear(f);
  }

  /** Busca pacientes por nombre o RUT. */
  async buscar(f: FiltroPacientesDto): Promise<Pagina<PacienteAdmin>> {
    const cond = ['1 = 1'];
    const params: unknown[] = [];
    if (f.buscar) {
      cond.push(`(CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno) LIKE ? OR u.rut LIKE ?)`);
      params.push(`%${escaparLike(f.buscar)}%`, `%${escaparLike(f.buscar.replace(/[.\-\s]/g, ''))}%`);
    }
    const where = cond.join(' AND ');
    const [{ total }] = await this.ds.query(`SELECT COUNT(*) AS total FROM (${PacientesService.SELECT} WHERE ${where}) t`, params);
    const filas = await this.ds.query(
      `${PacientesService.SELECT} WHERE ${where} ORDER BY u.apellido_paterno, u.nombres LIMIT ? OFFSET ?`,
      [...params, f.tamano, desplazamiento(f)],
    );
    return armarPagina(await Promise.all(filas.map((x: any) => this.mapear(x))), Number(total), f);
  }

  private validarContacto(telefono?: string | null, correo?: string | null): void {
    if (!telefono && !correo) throw new BadRequestException('Ingrese al menos un teléfono o un correo');
  }

  /**
   * Registra un paciente nuevo y genera su código de activación. Si el RUT ya existe, responde 409 con el registro
   * existente para que recepción lo use en vez de crear un duplicado.
   */
  async crear(actor: UsuarioAutenticado, dto: CrearPacienteDto) {
    const rut = normalizarRut(dto.rut);
    if (!rut) throw new BadRequestException('El RUT ingresado no es válido');
    if (!dto.nombres || !dto.apellidoPaterno) throw new BadRequestException('Ingrese nombres y apellido paterno');
    if (!dto.fechaNacimiento || !fechaNacimientoValida(dto.fechaNacimiento)) {
      throw new BadRequestException('La fecha de nacimiento no puede ser futura ni superar los 130 años');
    }
    this.validarContacto(dto.telefono, dto.correo);

    const existente = await this.usuarios.findOneBy({ rut });
    if (existente) {
      const esPaciente = await this.ds.query(`SELECT 1 AS ok FROM usuario_rol WHERE usuario_id = ? AND rol = 'PACIENTE'`, [existente.id]);
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message: esPaciente.length
            ? 'Ya existe un paciente con ese RUT'
            : 'Ese RUT está registrado con otro perfil. Pida a un administrador agregar el rol de paciente.',
          existe: true,
          pacienteId: esPaciente.length ? existente.id : null,
          nombre: existente.nombre,
        },
        HttpStatus.CONFLICT,
      );
    }

    const version = await this.config.numero('consentimiento_version');
    const res = await this.ds.transaction(async (m) => {
      const u = await m.save(
        m.create(Usuario, {
          rut,
          titulo: null,
          nombres: dto.nombres!,
          apellidoPaterno: dto.apellidoPaterno!,
          apellidoMaterno: dto.apellidoMaterno ?? null,
          correo: dto.correo ?? null,
          telefono: dto.telefono ?? null,
          passwordHash: null,
          activo: true,
        }),
      );
      await m.insert(UsuarioRol, { usuarioId: u.id, rol: Rol.PACIENTE, asignadoPor: actor.id });
      await m.insert(PerfilPaciente, {
        usuarioId: u.id,
        fechaNacimiento: dto.fechaNacimiento!,
        sexo: dto.sexo ?? null,
        direccion: dto.direccion ?? null,
        comuna: dto.comuna ?? null,
        emergenciaNombre: dto.emergenciaNombre ?? null,
        emergenciaTelefono: dto.emergenciaTelefono ?? null,
        emergenciaParentesco: dto.emergenciaParentesco ?? null,
        medioContacto: dto.medioContacto ?? null,
        aceptaRecordatorios: dto.aceptaRecordatorios ?? true,
        registradoPor: actor.id,
      });
      if (dto.consentimientoPresencial) {
        await m.insert(Consentimiento, { pacienteId: u.id, version, medio: 'PRESENCIAL', registradoPor: actor.id });
      }
      const codigo = await this.codigos.emitir(u.id, 'ACTIVACION', actor.id, m);
      await this.auditoria.registrar(actor, Accion.PACIENTE_CREAR, { recurso: 'paciente', recursoId: u.id, pacienteId: u.id }, m);
      return { id: u.id, codigo };
    });
    return { paciente: await this.detalle(res.id), codigoActivacion: res.codigo.codigo, venceEn: res.codigo.venceEn };
  }

  /** Aplica datos de contacto y preferencias a un paciente. */
  private async aplicarContacto(id: number, dto: ContactoPacienteDto): Promise<string[]> {
    const campos: string[] = [];
    const u: Partial<Usuario> = {};
    if (dto.telefono !== undefined) (u.telefono = dto.telefono || null, campos.push('telefono'));
    if (dto.correo !== undefined) (u.correo = dto.correo || null, campos.push('correo'));
    const p: Partial<PerfilPaciente> = {};
    if (dto.direccion !== undefined) (p.direccion = dto.direccion || null, campos.push('direccion'));
    if (dto.comuna !== undefined) (p.comuna = dto.comuna || null, campos.push('comuna'));
    if (dto.emergenciaNombre !== undefined) (p.emergenciaNombre = dto.emergenciaNombre || null, campos.push('emergencia'));
    if (dto.emergenciaTelefono !== undefined) p.emergenciaTelefono = dto.emergenciaTelefono || null;
    if (dto.emergenciaParentesco !== undefined) p.emergenciaParentesco = dto.emergenciaParentesco || null;
    if (dto.medioContacto !== undefined) (p.medioContacto = dto.medioContacto, campos.push('medioContacto'));
    if (dto.aceptaRecordatorios !== undefined) (p.aceptaRecordatorios = dto.aceptaRecordatorios, campos.push('aceptaRecordatorios'));
    if (Object.keys(u).length) await this.usuarios.update({ id }, u);
    if (Object.keys(p).length) {
      if (!(await this.perfiles.existsBy({ usuarioId: id }))) await this.perfiles.insert({ usuarioId: id });
      await this.perfiles.update({ usuarioId: id }, p);
    }
    return campos;
  }

  /** Actualiza datos administrativos desde recepción. */
  async editar(actor: UsuarioAutenticado, id: number, dto: EditarPacienteDto): Promise<PacienteAdmin> {
    const actual = await this.detalle(id);
    const campos = await this.aplicarContacto(id, dto);
    const u: Partial<Usuario> = {};
    if (dto.nombres !== undefined) (u.nombres = dto.nombres, campos.push('nombres'));
    if (dto.apellidoPaterno !== undefined) (u.apellidoPaterno = dto.apellidoPaterno, campos.push('apellidoPaterno'));
    if (dto.apellidoMaterno !== undefined) (u.apellidoMaterno = dto.apellidoMaterno || null, campos.push('apellidoMaterno'));
    if (Object.keys(u).length) await this.usuarios.update({ id }, u);
    if (dto.fechaNacimiento !== undefined) {
      if (!fechaNacimientoValida(dto.fechaNacimiento)) throw new BadRequestException('La fecha de nacimiento no puede ser futura ni superar los 130 años');
      await this.perfiles.update({ usuarioId: id }, { fechaNacimiento: dto.fechaNacimiento });
      campos.push('fechaNacimiento');
    }
    if (dto.sexo !== undefined) (await this.perfiles.update({ usuarioId: id }, { sexo: dto.sexo }), campos.push('sexo'));
    const despues = await this.detalle(id);
    if (!despues.telefono && !despues.correo) {
      // Se revierte el contacto: no puede quedar un paciente sin ningún medio.
      await this.usuarios.update({ id }, { telefono: actual.telefono, correo: actual.correo });
      throw new BadRequestException('El paciente debe conservar al menos un teléfono o un correo');
    }
    await this.auditoria.registrar(actor, Accion.PACIENTE_EDITAR, { recurso: 'paciente', recursoId: id, pacienteId: id, detalle: campos.join(',') });
    return this.detalle(id);
  }

  /** Perfil del propio paciente. */
  miPerfil(actor: UsuarioAutenticado): Promise<PacienteAdmin> {
    return this.detalle(actor.id);
  }

  /** El paciente edita su contacto y preferencias. No puede cambiar RUT, nombre ni fecha de nacimiento. */
  async editarMiPerfil(actor: UsuarioAutenticado, dto: ContactoPacienteDto): Promise<PacienteAdmin> {
    const actual = await this.detalle(actor.id);
    const campos = await this.aplicarContacto(actor.id, dto);
    const despues = await this.detalle(actor.id);
    if (!despues.telefono && !despues.correo) {
      await this.usuarios.update({ id: actor.id }, { telefono: actual.telefono, correo: actual.correo });
      throw new BadRequestException('Debe conservar al menos un teléfono o un correo');
    }
    await this.auditoria.registrar(actor, Accion.PACIENTE_EDITAR, { recurso: 'paciente', recursoId: actor.id, pacienteId: actor.id, detalle: campos.join(',') });
    return this.detalle(actor.id);
  }

  /** Emite un código de activación o de recuperación para un paciente. */
  async emitirCodigo(actor: UsuarioAutenticado, id: number) {
    const p = await this.detalle(id);
    if (!p.activo) throw new BadRequestException('La cuenta está desactivada');
    const tipo = p.sinActivar ? 'ACTIVACION' : 'RECUPERACION';
    const r = await this.codigos.emitir(id, tipo, actor.id);
    if (tipo === 'RECUPERACION') await this.auth.revocarSesionesDe(id);
    await this.auditoria.registrar(actor, Accion.CODIGO_EMITIR, { recurso: 'paciente', recursoId: id, pacienteId: id, detalle: tipo });
    return { codigo: r.codigo, venceEn: r.venceEn, tipo };
  }

  /** Posibles duplicados: mismo nombre y fecha de nacimiento. */
  async duplicados() {
    const filas = await this.ds.query(
      `SELECT a.id AS aId, a.rut AS aRut, b.id AS bId, b.rut AS bRut,
              CONCAT_WS(' ', a.nombres, a.apellido_paterno, a.apellido_materno) AS aNombre,
              CONCAT_WS(' ', b.nombres, b.apellido_paterno, b.apellido_materno) AS bNombre, pa.fecha_nacimiento AS fecha
       FROM usuarios a
       JOIN perfil_paciente pa ON pa.usuario_id = a.id
       JOIN usuarios b ON b.id > a.id
       JOIN perfil_paciente pb ON pb.usuario_id = b.id
       WHERE a.activo = 1 AND b.activo = 1 AND pa.fecha_nacimiento IS NOT NULL AND pa.fecha_nacimiento = pb.fecha_nacimiento
         AND LOWER(TRIM(a.nombres)) = LOWER(TRIM(b.nombres)) AND LOWER(TRIM(a.apellido_paterno)) = LOWER(TRIM(b.apellido_paterno))`,
    );
    return filas.map((f: any) => ({
      fechaNacimiento: f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : f.fecha,
      a: { id: f.aId, rut: formatearRut(f.aRut), nombre: f.aNombre },
      b: { id: f.bId, rut: formatearRut(f.bRut), nombre: f.bNombre },
    }));
  }

  /**
   * Une dos fichas del mismo paciente: mueve todo al registro conservado y desactiva el otro. No tiene deshacer.
   *
   * @throws BadRequestException si el RUT de confirmación no coincide o el registro a fusionar tiene otros roles.
   * @throws ConflictException si ambos tienen una cita activa a la misma hora.
   */
  async fusionar(actor: UsuarioAutenticado, dto: FusionarPacientesDto): Promise<PacienteAdmin> {
    if (dto.conservadoId === dto.fusionadoId) throw new BadRequestException('Debe elegir dos registros distintos');
    const conservado = await this.detalle(dto.conservadoId);
    const fusionado = await this.detalle(dto.fusionadoId);
    if (normalizarRut(dto.rutConfirmacion) !== normalizarRut(fusionado.rut)) {
      throw new BadRequestException('El RUT de confirmación no coincide con el registro que se va a fusionar');
    }
    const [{ otros }] = await this.ds.query(`SELECT COUNT(*) AS otros FROM usuario_rol WHERE usuario_id = ? AND rol <> 'PACIENTE'`, [dto.fusionadoId]);
    if (Number(otros) > 0) throw new BadRequestException('El registro a fusionar tiene otros roles y no se puede fusionar');

    const tablas = ['citas', 'contactos', 'antecedentes', 'atenciones', 'signos_vitales', 'diagnosticos', 'examenes', 'documentos', 'recomendaciones', 'eventos_tratamiento', 'consentimientos'];
    try {
      await this.ds.transaction(async (m) => {
        for (const t of tablas) await m.query(`UPDATE ${t} SET paciente_id = ? WHERE paciente_id = ?`, [dto.conservadoId, dto.fusionadoId]);
        await m.query(
          `INSERT IGNORE INTO doctor_paciente (doctor_id, paciente_id, created_at, origen, creada_por, vigente)
           SELECT doctor_id, ?, created_at, origen, creada_por, vigente FROM doctor_paciente WHERE paciente_id = ?`,
          [dto.conservadoId, dto.fusionadoId],
        );
        await m.query(
          `UPDATE doctor_paciente SET vigente = 1, cerrada_en = NULL, motivo_cierre = NULL WHERE paciente_id = ?
             AND doctor_id IN (SELECT doctor_id FROM (SELECT doctor_id FROM doctor_paciente WHERE paciente_id = ? AND vigente = 1) x)`,
          [dto.conservadoId, dto.fusionadoId],
        );
        await m.query('DELETE FROM doctor_paciente WHERE paciente_id = ?', [dto.fusionadoId]);
        await m.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [dto.fusionadoId]);
        await m.query('INSERT INTO fusiones (conservado_id, fusionado_id, motivo, hecha_por) VALUES (?, ?, ?, ?)', [
          dto.conservadoId,
          dto.fusionadoId,
          dto.motivo,
          actor.id,
        ]);
        await this.auditoria.registrar(actor, Accion.PACIENTE_FUSIONAR, {
          recurso: 'paciente',
          recursoId: dto.fusionadoId,
          pacienteId: dto.conservadoId,
          detalle: `fusionado ${dto.fusionadoId} -> ${dto.conservadoId}`,
        }, m);
      });
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) {
        throw new ConflictException('Ambos pacientes tienen una cita activa a la misma hora. Resuélvalo antes de fusionar.');
      }
      throw e;
    }
    await this.auth.revocarSesionesDe(dto.fusionadoId);
    void conservado;
    return this.detalle(dto.conservadoId);
  }
}
