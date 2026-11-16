import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import { formatearRut, normalizarRut } from '../common/rut.util.js';
import { contextoActual } from '../common/contexto.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Consentimiento } from '../pacientes/pacientes.entities.js';
import { Rol } from '../usuarios/rol.enum.js';
import { Usuario, UsuarioRol } from '../usuarios/usuario.entity.js';
import { IntentoLogin, Sesion } from './auth.entities.js';
import type { ActivarCuentaDto } from './auth.dto.js';
import type { LoginRespuestaDto, UsuarioSesionDto } from './auth.respuestas.js';
import { CodigosService } from './codigos.service.js';
import { sha256, tokenAleatorio, validarPassword } from './seguridad.util.js';
import type { JwtPayload, UsuarioAutenticado } from './usuario-autenticado.js';

/** Resultado de crear o renovar una sesión: lo que va en el cuerpo y el valor de la cookie de renovación. */
export interface ResultadoSesion {
  respuesta: LoginRespuestaDto;
  /** Valor de la cookie de renovación (`<id>.<token>`); no se envía si la sesión no rotó. */
  cookie: { valor: string; expira: Date } | null;
}

/** Gracia, en milisegundos, en que dos pestañas pueden renovar a la vez con el mismo token sin que parezca un robo. */
const GRACIA_RENOVACION_MS = 20_000;

/**
 * Inicio y cierre de sesión, renovación, selección de rol, activación de cuentas y cambio de contraseña.
 *
 * El token de acceso dura 15 minutos y lleva el rol activo; el de renovación es de un solo uso, se guarda
 * como hash y, si se presenta uno ya gastado fuera de la gracia, se revoca toda la sesión.
 */
@Injectable()
export class AuthService {
  private readonly hashFalso = bcrypt.hashSync('sin-usuario', 10);

  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioRol) private readonly rolesRepo: Repository<UsuarioRol>,
    @InjectRepository(Sesion) private readonly sesiones: Repository<Sesion>,
    @InjectRepository(IntentoLogin) private readonly intentos: Repository<IntentoLogin>,
    @InjectRepository(Consentimiento) private readonly consentimientos: Repository<Consentimiento>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaService,
    private readonly codigos: CodigosService,
  ) {}

  // ───────────────────────── Intentos y bloqueo ─────────────────────────

  /** Lanza 429 si el RUT o la IP superaron los intentos fallidos permitidos en la ventana de bloqueo. */
  private async exigirNoBloqueado(rut: string): Promise<void> {
    const max = await this.config.numero('login_intentos_max');
    const minutos = await this.config.numero('login_bloqueo_min');
    const desde = new Date(Date.now() - minutos * 60_000);
    const ip = contextoActual().ip;
    const porRut = await this.intentos.count({ where: { rut, exitoso: false, createdAt: MoreThan(desde) } });
    const porIp = ip ? await this.intentos.count({ where: { ip, exitoso: false, createdAt: MoreThan(desde) } }) : 0;
    if (porRut >= max || porIp >= max * 4) {
      await this.auditoria.registrar(null, Accion.LOGIN_BLOQUEADO, { recurso: 'sesion', detalle: `rut=${rut}`, resultado: 'DENEGADO' });
      throw new HttpException(
        `Demasiados intentos fallidos. Intente nuevamente en ${minutos} minutos.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async anotarIntento(rut: string, exitoso: boolean): Promise<void> {
    await this.intentos.insert({ rut, ip: contextoActual().ip, exitoso });
    if (exitoso) await this.intentos.delete({ rut, exitoso: false });
  }

  // ───────────────────────── Sesiones ─────────────────────────

  /** Roles vigentes de un usuario. */
  async rolesDe(usuarioId: number): Promise<Rol[]> {
    const filas = await this.rolesRepo.find({ where: { usuarioId } });
    return filas.map((f) => f.rol);
  }

  /** Datos del usuario como los ve el frontend. */
  async usuarioSesion(usuarioId: number, rolActivo: Rol | null): Promise<UsuarioSesionDto> {
    const u = await this.usuarios.findOneByOrFail({ id: usuarioId });
    const [fila] = await this.ds.query(
      `SELECT e.nombre AS especialidad FROM perfil_profesional p JOIN especialidades e ON e.id = p.especialidad_id WHERE p.usuario_id = ?`,
      [usuarioId],
    );
    return {
      id: u.id,
      nombre: u.nombre,
      rut: formatearRut(u.rut),
      roles: await this.rolesDe(usuarioId),
      rol: rolActivo,
      especialidad: fila?.especialidad ?? null,
      debeCambiarPassword: u.debeCambiarPassword,
    };
  }

  private async firmar(usuarioId: number, sesionId: string, rol: Rol | null): Promise<string> {
    const payload: JwtPayload = { sub: usuarioId, sid: sesionId, rol };
    return this.jwt.signAsync(payload);
  }

  /** Crea una sesión nueva para un usuario ya autenticado. */
  private async crearSesion(usuario: Usuario, roles: Rol[]): Promise<ResultadoSesion> {
    const personal = roles.some((r) => r !== Rol.PACIENTE);
    const duracionMs = personal
      ? (await this.config.numero('sesion_personal_horas')) * 3_600_000
      : (await this.config.numero('sesion_paciente_dias')) * 86_400_000;
    const expira = new Date(Date.now() + duracionMs);
    const token = tokenAleatorio();
    const ctx = contextoActual();
    const rolActivo = roles.length === 1 ? roles[0] : null;
    const sesion = await this.sesiones.save(
      this.sesiones.create({
        usuarioId: usuario.id,
        tokenHash: sha256(token),
        tokenAnteriorHash: null,
        rolActivo,
        agente: ctx.agente,
        ip: ctx.ip,
        expiraEn: expira,
        revocadaEn: null,
        ultimoUso: new Date(),
      }),
    );
    await this.usuarios.update({ id: usuario.id }, { ultimoAcceso: new Date() });
    return {
      respuesta: { accessToken: await this.firmar(usuario.id, sesion.id, rolActivo), usuario: await this.usuarioSesion(usuario.id, rolActivo) },
      cookie: { valor: `${sesion.id}.${token}`, expira },
    };
  }

  // ───────────────────────── Login ─────────────────────────

  /**
   * Inicia sesión con RUT y contraseña.
   *
   * @param metodo Si es `CLAVE_UNICA_SIMULADA`, se deja constancia de que el acceso fue por la simulación.
   * @throws UnauthorizedException si el RUT o la contraseña no son correctos (mismo mensaje en todos los casos).
   * @throws HttpException 429 si el RUT o la IP están bloqueados por intentos fallidos.
   */
  async login(rutEntrada: string, password: string, metodo: 'PASSWORD' | 'CLAVE_UNICA_SIMULADA' = 'PASSWORD'): Promise<ResultadoSesion> {
    const rut = normalizarRut(rutEntrada);
    if (!rut) throw new BadRequestException('El RUT ingresado no es válido');
    if (metodo === 'CLAVE_UNICA_SIMULADA' && !(await this.config.booleano('clave_unica_simulada'))) {
      throw new ForbiddenException('La Clave Única simulada no está activada');
    }
    await this.exigirNoBloqueado(rut);

    const usuario = await this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.rut = :rut AND u.activo = 1', { rut })
      .getOne();
    const coincide = await bcrypt.compare(password, usuario?.passwordHash ?? this.hashFalso);
    if (!usuario || !usuario.passwordHash || !coincide) {
      await this.anotarIntento(rut, false);
      await this.auditoria.registrar(usuario ? { id: usuario.id, rol: null } : null, Accion.LOGIN_FALLIDO, {
        recurso: 'sesion',
        detalle: `rut=${rut}`,
        resultado: 'DENEGADO',
      });
      throw new UnauthorizedException('RUT o contraseña incorrectos');
    }
    await this.anotarIntento(rut, true);
    const roles = await this.rolesDe(usuario.id);
    if (roles.length === 0) throw new UnauthorizedException('RUT o contraseña incorrectos');
    const res = await this.crearSesion(usuario, roles);
    await this.auditoria.registrar(
      { id: usuario.id, rol: res.respuesta.usuario.rol },
      metodo === 'PASSWORD' ? Accion.LOGIN_OK : Accion.CLAVE_UNICA_SIMULADA,
      { recurso: 'sesion' },
    );
    return res;
  }

  // ───────────────────────── Rol activo, renovación y cierre ─────────────────────────

  /** Fija el rol activo de la sesión y entrega un token nuevo que lo lleva. */
  async elegirRol(actor: UsuarioAutenticado, rol: Rol): Promise<LoginRespuestaDto> {
    if (!actor.roles.includes(rol)) throw new ForbiddenException('No tiene ese perfil');
    await this.sesiones.update({ id: actor.sesionId }, { rolActivo: rol });
    await this.auditoria.registrar({ id: actor.id, rol }, Accion.CAMBIO_ROL, { recurso: 'sesion', detalle: `${actor.rol ?? '-'} -> ${rol}` });
    return { accessToken: await this.firmar(actor.id, actor.sesionId, rol), usuario: await this.usuarioSesion(actor.id, rol) };
  }

  /**
   * Cambia el token de renovación por uno nuevo y entrega un token de acceso.
   *
   * @param valorCookie Valor de la cookie `<id>.<token>`.
   * @throws UnauthorizedException si la cookie falta, venció, fue revocada o se reutilizó un token gastado.
   */
  async renovar(valorCookie: string | null): Promise<ResultadoSesion> {
    const invalida = () => new UnauthorizedException('Sesión inválida o expirada');
    if (!valorCookie) throw invalida();
    const [id, token] = valorCookie.split('.');
    if (!id || !token || !/^\d+$/.test(id)) throw invalida();
    const sesion = await this.sesiones.findOneBy({ id });
    if (!sesion || sesion.revocadaEn || sesion.expiraEn.getTime() <= Date.now()) throw invalida();
    const usuario = await this.usuarios.findOneBy({ id: sesion.usuarioId });
    if (!usuario || !usuario.activo) throw invalida();

    const hash = sha256(token);
    let cookie: ResultadoSesion['cookie'] = null;
    if (hash === sesion.tokenHash) {
      const nuevo = tokenAleatorio();
      // Rotación condicionada al token actual: si dos pestañas llegan a la vez, solo una rota.
      const r = await this.sesiones.update({ id, tokenHash: hash }, { tokenHash: sha256(nuevo), tokenAnteriorHash: hash, ultimoUso: new Date() });
      if (r.affected === 1) cookie = { valor: `${id}.${nuevo}`, expira: sesion.expiraEn };
    } else if (hash === sesion.tokenAnteriorHash && Date.now() - sesion.ultimoUso.getTime() <= GRACIA_RENOVACION_MS) {
      // La otra pestaña ya renovó hace instantes: el navegador tiene la cookie nueva. No se rota de nuevo.
    } else {
      await this.sesiones.update({ id }, { revocadaEn: new Date() });
      await this.auditoria.registrar({ id: sesion.usuarioId, rol: sesion.rolActivo }, Accion.SESION_REVOCADA, {
        recurso: 'sesion',
        recursoId: id,
        detalle: 'token de renovación reutilizado',
        resultado: 'DENEGADO',
      });
      throw invalida();
    }
    const roles = await this.rolesDe(usuario.id);
    const rolActivo = sesion.rolActivo && roles.includes(sesion.rolActivo) ? sesion.rolActivo : roles.length === 1 ? roles[0] : null;
    return {
      respuesta: { accessToken: await this.firmar(usuario.id, id, rolActivo), usuario: await this.usuarioSesion(usuario.id, rolActivo) },
      cookie,
    };
  }

  /** Revoca la sesión actual. */
  async logout(actor: UsuarioAutenticado): Promise<void> {
    await this.sesiones.update({ id: actor.sesionId }, { revocadaEn: new Date() });
    await this.auditoria.registrar(actor, Accion.LOGOUT, { recurso: 'sesion', recursoId: actor.sesionId });
  }

  /** Sesiones activas del usuario, para que cierre las que no reconoce. */
  async listarSesiones(actor: UsuarioAutenticado) {
    const filas = await this.sesiones.find({
      where: { usuarioId: actor.id, revocadaEn: IsNull(), expiraEn: MoreThan(new Date()) },
      order: { ultimoUso: 'DESC' },
    });
    return filas.map((s) => ({
      id: s.id,
      agente: s.agente,
      ip: s.ip,
      ultimoUso: s.ultimoUso,
      creada: s.createdAt,
      actual: s.id === actor.sesionId,
    }));
  }

  /** Cierra una sesión propia. */
  async cerrarSesion(actor: UsuarioAutenticado, id: string): Promise<void> {
    const r = await this.sesiones.update({ id, usuarioId: actor.id, revocadaEn: IsNull() }, { revocadaEn: new Date() });
    if (r.affected === 0) throw new BadRequestException('La sesión no existe o ya está cerrada');
    await this.auditoria.registrar(actor, Accion.SESION_REVOCADA, { recurso: 'sesion', recursoId: id });
  }

  /** Cierra todas las sesiones de un usuario, salvo la indicada. */
  async revocarSesionesDe(usuarioId: number, exceptoId?: string): Promise<void> {
    const q = this.sesiones.createQueryBuilder().update().set({ revocadaEn: new Date() }).where('usuario_id = :usuarioId AND revocada_en IS NULL', { usuarioId });
    if (exceptoId) q.andWhere('id <> :exceptoId', { exceptoId });
    await q.execute();
  }

  // ───────────────────────── Activación y contraseña ─────────────────────────

  /**
   * Activa una cuenta (o recupera el acceso) con un código de un solo uso y fija la contraseña.
   * El paciente debe aceptar el consentimiento vigente la primera vez.
   *
   * @throws BadRequestException con un mensaje genérico si el RUT o el código no corresponden.
   */
  async activar(dto: ActivarCuentaDto): Promise<ResultadoSesion> {
    const rut = normalizarRut(dto.rut);
    if (!rut) throw new BadRequestException('El RUT ingresado no es válido');
    await this.exigirNoBloqueado(rut);
    const generico = () => new BadRequestException('El RUT o el código no son válidos, o el código ya venció');

    const usuario = await this.usuarios.findOneBy({ rut, activo: true });
    const codigo = usuario ? await this.codigos.buscarVigente(usuario.id, dto.codigo) : null;
    if (!usuario || !codigo) {
      await this.anotarIntento(rut, false);
      await this.auditoria.registrar(usuario ? { id: usuario.id, rol: null } : null, Accion.LOGIN_FALLIDO, {
        recurso: 'codigo',
        detalle: `activación rut=${rut}`,
        resultado: 'DENEGADO',
      });
      throw generico();
    }
    const errorPassword = validarPassword(dto.password, rut);
    if (errorPassword) throw new BadRequestException(errorPassword);

    const roles = await this.rolesDe(usuario.id);
    const version = await this.config.numero('consentimiento_version');
    if (roles.includes(Rol.PACIENTE)) {
      const yaAcepto = await this.consentimientos.existsBy({ pacienteId: usuario.id, version });
      if (!yaAcepto) {
        if (dto.aceptaConsentimiento !== true) throw new BadRequestException('Debe aceptar el consentimiento para activar su cuenta');
        await this.consentimientos.insert({ pacienteId: usuario.id, version, medio: 'APP', registradoPor: usuario.id });
      }
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.usuarios.update({ id: usuario.id }, { passwordHash, debeCambiarPassword: false });
    await this.codigos.consumir(codigo.id);
    await this.revocarSesionesDe(usuario.id);
    await this.anotarIntento(rut, true);
    await this.auditoria.registrar({ id: usuario.id, rol: null }, Accion.ACTIVACION, { recurso: 'usuario', recursoId: usuario.id });

    const res = await this.crearSesion(usuario, roles);
    return res;
  }

  /**
   * Cambia la contraseña propia y cierra las demás sesiones.
   *
   * @throws UnauthorizedException si la contraseña actual no coincide.
   */
  async cambiarPassword(actor: UsuarioAutenticado, actual: string, nueva: string): Promise<void> {
    const u = await this.usuarios.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id: actor.id }).getOneOrFail();
    if (!u.passwordHash || !(await bcrypt.compare(actual, u.passwordHash))) {
      await this.auditoria.registrar(actor, Accion.CAMBIO_PASSWORD, { recurso: 'usuario', recursoId: actor.id, resultado: 'DENEGADO' });
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    const error = validarPassword(nueva, u.rut);
    if (error) throw new BadRequestException(error);
    await this.usuarios.update({ id: actor.id }, { passwordHash: await bcrypt.hash(nueva, 10), debeCambiarPassword: false });
    await this.revocarSesionesDe(actor.id, actor.sesionId);
    await this.auditoria.registrar(actor, Accion.CAMBIO_PASSWORD, { recurso: 'usuario', recursoId: actor.id });
  }
}
