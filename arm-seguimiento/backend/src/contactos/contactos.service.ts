import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccesoClinicoService } from '../asignaciones/acceso-clinico.service.js';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { hoyLocal, inicioDiaUtc } from '../common/fechas.util.js';
import { armarPagina, desplazamiento, type Pagina } from '../common/paginacion.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Rol } from '../usuarios/rol.enum.js';
import type { CrearContactoDto, EditarContactoDto, EnvioSimuladoDto, FiltroContactosDto } from './contactos.dto.js';
import { Contacto } from './contacto.entity.js';

/** Contacto listo para mostrar. */
export interface ContactoVista {
  id: number;
  paciente: { id: number; nombre: string };
  medio: string;
  sentido: string;
  motivo: string;
  resultado: string;
  detalle: string | null;
  simulado: boolean;
  responsable: { id: number; nombre: string };
  citaId: number | null;
  proximoContacto: string | null;
  cerrado: boolean;
  solicitadoPor: number | null;
  createdAt: Date;
}

const SELECT = `
  SELECT c.id, c.medio, c.sentido, c.motivo, c.resultado, c.detalle, c.simulado, c.cita_id AS citaId,
         c.proximo_contacto AS proximoContacto, c.cerrado, c.solicitado_por AS solicitadoPor, c.created_at AS createdAt,
         p.id AS pacienteId, TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)) AS paciente,
         r.id AS responsableId, TRIM(CONCAT_WS(' ', r.titulo, r.nombres, r.apellido_paterno)) AS responsable
  FROM contactos c JOIN usuarios p ON p.id = c.paciente_id JOIN usuarios r ON r.id = c.responsable_id`;

/**
 * Formulario estandarizado de contacto: un mismo registro para llamada, WhatsApp, correo y atención presencial.
 * Da trazabilidad de las interacciones con cada paciente. El detalle es administrativo, nunca clínico.
 */
@Injectable()
export class ContactosService {
  constructor(
    @InjectRepository(Contacto) private readonly repo: Repository<Contacto>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: AccesoClinicoService,
    private readonly config: ConfiguracionService,
  ) {}

  private aVista(f: any, verDetalle: boolean): ContactoVista {
    return {
      id: f.id,
      paciente: { id: f.pacienteId, nombre: f.paciente },
      medio: f.medio,
      sentido: f.sentido,
      motivo: f.motivo,
      resultado: f.resultado,
      detalle: verDetalle ? f.detalle : null,
      simulado: !!f.simulado,
      responsable: { id: f.responsableId, nombre: f.responsable },
      citaId: f.citaId,
      proximoContacto: f.proximoContacto instanceof Date ? f.proximoContacto.toISOString().slice(0, 10) : f.proximoContacto,
      cerrado: !!f.cerrado,
      solicitadoPor: f.solicitadoPor,
      createdAt: f.createdAt,
    };
  }

  private async exigirPaciente(id: number): Promise<void> {
    const [f] = await this.ds.query(`SELECT 1 AS ok FROM usuarios u JOIN usuario_rol r ON r.usuario_id = u.id AND r.rol = 'PACIENTE' WHERE u.id = ? AND u.activo = 1`, [id]);
    if (!f) throw new NotFoundException('Paciente no encontrado');
  }

  /** Advertencias que se muestran antes de contactar: preferencia de medio y tope de frecuencia. */
  async advertencias(pacienteId: number, medio?: string): Promise<string[]> {
    await this.exigirPaciente(pacienteId);
    const salida: string[] = [];
    const [pref] = await this.ds.query('SELECT medio_contacto AS medio, acepta_recordatorios AS acepta FROM perfil_paciente WHERE usuario_id = ?', [pacienteId]);
    if (pref?.acepta === 0) salida.push('El paciente pidió no recibir recordatorios');
    if (pref?.medio && medio && medio !== 'PRESENCIAL' && pref.medio !== medio) salida.push(`El paciente prefiere ser contactado por ${pref.medio}`);
    const tope = await this.config.numero('contactos_tope_salientes');
    const [{ n }] = await this.ds.query(
      `SELECT COUNT(*) AS n FROM contactos WHERE paciente_id = ? AND sentido = 'SALIENTE' AND created_at >= (UTC_TIMESTAMP(6) - INTERVAL 7 DAY)`,
      [pacienteId],
    );
    if (Number(n) >= tope) salida.push(`El paciente ya tuvo ${n} contactos salientes en los últimos 7 días`);
    return salida;
  }

  /** Registra un contacto. El responsable es siempre quien inició sesión. */
  async crear(actor: UsuarioAutenticado, dto: CrearContactoDto): Promise<{ contacto: ContactoVista; advertencias: string[] }> {
    await this.exigirPaciente(dto.pacienteId);
    const advertencias = dto.sentido === 'SALIENTE' ? await this.advertencias(dto.pacienteId, dto.medio) : [];
    if (dto.proximoContacto && dto.proximoContacto < hoyLocal()) throw new BadRequestException('El próximo contacto no puede ser una fecha pasada');
    const c = await this.repo.save(
      this.repo.create({
        pacienteId: dto.pacienteId,
        medio: dto.medio,
        sentido: dto.sentido,
        motivo: dto.motivo,
        resultado: dto.resultado,
        detalle: dto.detalle ?? null,
        simulado: false,
        responsableId: actor.id,
        citaId: dto.citaId ?? null,
        proximoContacto: dto.proximoContacto ?? null,
        cerrado: dto.resultado === 'RESUELTO' || dto.resultado === 'DERIVADO',
        solicitadoPor: null,
      }),
    );
    await this.auditoria.registrar(actor, Accion.CONTACTO_CREAR, { recurso: 'contacto', recursoId: c.id, pacienteId: dto.pacienteId });
    return { contacto: await this.vista(actor, c.id), advertencias };
  }

  /** Registra un envío simulado por WhatsApp o correo. No sale ningún mensaje real. */
  async enviarSimulado(actor: UsuarioAutenticado, dto: EnvioSimuladoDto): Promise<{ contacto: ContactoVista; advertencias: string[] }> {
    await this.exigirPaciente(dto.pacienteId);
    const advertencias = await this.advertencias(dto.pacienteId, dto.medio);
    const [pref] = await this.ds.query('SELECT acepta_recordatorios AS acepta FROM perfil_paciente WHERE usuario_id = ?', [dto.pacienteId]);
    if (dto.motivo === 'RECORDATORIO' && pref?.acepta === 0) throw new BadRequestException('El paciente pidió no recibir recordatorios');
    const c = await this.repo.save(
      this.repo.create({
        pacienteId: dto.pacienteId,
        medio: dto.medio,
        sentido: 'SALIENTE',
        motivo: dto.motivo,
        resultado: 'RESUELTO',
        detalle: `[SIMULADO] ${dto.texto}`,
        simulado: true,
        responsableId: actor.id,
        citaId: null,
        proximoContacto: null,
        cerrado: true,
        solicitadoPor: null,
      }),
    );
    await this.auditoria.registrar(actor, Accion.CONTACTO_CREAR, { recurso: 'contacto', recursoId: c.id, pacienteId: dto.pacienteId, detalle: 'envío simulado' });
    return { contacto: await this.vista(actor, c.id), advertencias };
  }

  /** Un médico pide a recepción que contacte a un paciente suyo. Aparece en los pendientes de recepción. */
  async solicitarSeguimiento(actor: UsuarioAutenticado, pacienteId: number, mensaje?: string): Promise<ContactoVista> {
    await this.acceso.exigirEscritura(actor, pacienteId);
    const c = await this.repo.save(
      this.repo.create({
        pacienteId,
        medio: 'LLAMADA',
        sentido: 'SALIENTE',
        motivo: 'SEGUIMIENTO',
        resultado: 'REQUIERE_SEGUIMIENTO',
        detalle: mensaje ? `Solicitado por el médico: ${mensaje}` : 'Solicitado por el médico',
        simulado: false,
        responsableId: actor.id,
        citaId: null,
        proximoContacto: hoyLocal(),
        cerrado: false,
        solicitadoPor: actor.id,
      }),
    );
    await this.auditoria.registrar(actor, Accion.CONTACTO_CREAR, { recurso: 'contacto', recursoId: c.id, pacienteId, detalle: 'solicitud de seguimiento' });
    return this.vista(actor, c.id);
  }

  private async vista(actor: UsuarioAutenticado, id: number): Promise<ContactoVista> {
    const [f] = await this.ds.query(`${SELECT} WHERE c.id = ?`, [id]);
    if (!f) throw new NotFoundException('Contacto no encontrado');
    return this.aVista(f, actor.rol !== Rol.ADMINISTRADOR);
  }

  /** Completa el resultado, fija el próximo contacto, cierra el seguimiento o agrega una nota. */
  async editar(actor: UsuarioAutenticado, id: number, dto: EditarContactoDto): Promise<ContactoVista> {
    const c = await this.repo.findOneBy({ id });
    if (!c) throw new NotFoundException('Contacto no encontrado');
    const propio = c.responsableId === actor.id;
    const solicitud = c.solicitadoPor !== null && !c.cerrado;
    if (!propio && !solicitud) throw new ForbiddenException('Solo puede modificar sus propios contactos');
    const cambios: Partial<Contacto> = {};
    if (dto.resultado) cambios.resultado = dto.resultado;
    if (dto.proximoContacto) {
      if (dto.proximoContacto < hoyLocal()) throw new BadRequestException('El próximo contacto no puede ser una fecha pasada');
      cambios.proximoContacto = dto.proximoContacto;
    }
    if (dto.cerrado !== undefined) cambios.cerrado = dto.cerrado;
    if (dto.agregarNota) {
      const nota = `\n[${hoyLocal()}] ${dto.agregarNota}`;
      const nuevo = `${c.detalle ?? ''}${nota}`.trim();
      if (nuevo.length > 1000) throw new BadRequestException('El detalle superó el largo máximo');
      cambios.detalle = nuevo;
    }
    if (Object.keys(cambios).length === 0) throw new BadRequestException('No hay cambios que guardar');
    await this.repo.update({ id }, cambios);
    await this.auditoria.registrar(actor, Accion.CONTACTO_EDITAR, { recurso: 'contacto', recursoId: id, pacienteId: c.pacienteId, detalle: Object.keys(cambios).join(',') });
    return this.vista(actor, id);
  }

  /** Lista contactos con filtros. El administrador no ve el detalle. */
  async listar(actor: UsuarioAutenticado, f: FiltroContactosDto): Promise<Pagina<ContactoVista>> {
    const cond = ['1 = 1'];
    const params: unknown[] = [];
    if (f.paciente) (cond.push('c.paciente_id = ?'), params.push(f.paciente));
    if (f.medio) (cond.push('c.medio = ?'), params.push(f.medio));
    if (f.resultado) (cond.push('c.resultado = ?'), params.push(f.resultado));
    if (f.desde) (cond.push('c.created_at >= ?'), params.push(inicioDiaUtc(f.desde)));
    const where = cond.join(' AND ');
    const [{ total }] = await this.ds.query(`SELECT COUNT(*) AS total FROM contactos c WHERE ${where}`, params);
    const filas = await this.ds.query(`${SELECT} WHERE ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`, [...params, f.tamano, desplazamiento(f)]);
    return armarPagina(filas.map((x: any) => this.aVista(x, actor.rol !== Rol.ADMINISTRADOR)), Number(total), f);
  }

  /** Historial de contactos de un paciente. Un médico solo lo ve si tiene relación con el paciente. */
  async delPaciente(actor: UsuarioAutenticado, pacienteId: number, pag: FiltroContactosDto): Promise<Pagina<ContactoVista>> {
    if (actor.rol === Rol.MEDICO) await this.acceso.exigirLectura(actor, pacienteId);
    await this.exigirPaciente(pacienteId);
    return this.listar(actor, { ...pag, paciente: pacienteId });
  }

  /** Contactos con seguimiento vencido o para hoy. */
  async pendientes(actor: UsuarioAutenticado): Promise<ContactoVista[]> {
    const filas = await this.ds.query(
      `${SELECT} WHERE c.cerrado = 0 AND c.proximo_contacto IS NOT NULL AND c.proximo_contacto <= ? ORDER BY c.proximo_contacto, c.id LIMIT 200`,
      [hoyLocal()],
    );
    return filas.map((x: any) => this.aVista(x, actor.rol !== Rol.ADMINISTRADOR));
  }
}
