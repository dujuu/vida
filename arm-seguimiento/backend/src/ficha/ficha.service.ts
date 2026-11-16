import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccesoClinicoService, type AlcanceLectura } from '../asignaciones/acceso-clinico.service.js';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { hoyLocal } from '../common/fechas.util.js';
import { armarPagina, desplazamiento, type Pagina } from '../common/paginacion.js';
import { formatearRut } from '../common/rut.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type {
  CrearAntecedenteDto,
  CrearAtencionDto,
  CrearDiagnosticoDto,
  CrearExamenDto,
  EditarAntecedenteDto,
  EditarAtencionDto,
  EditarDiagnosticoDto,
  EditarExamenDto,
  EnmiendaDto,
  FiltroAntecedentesDto,
  FiltroAtencionesDto,
  SignosVitalesDto,
} from './ficha.dto.js';
import { Antecedente, Atencion, Diagnostico, Enmienda, Examen, SignosVitales } from './ficha.entities.js';
import { calcularEdad, calcularImc } from './ficha.util.js';

const aFecha = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string | null) ?? null));
const nombreMedico = (alias: string) => `TRIM(CONCAT_WS(' ', ${alias}.titulo, ${alias}.nombres, ${alias}.apellido_paterno))`;

/**
 * Ficha clínica del paciente: antecedentes, atenciones, signos vitales, diagnósticos, exámenes y enmiendas.
 *
 * Todas las rutas pasan por `AccesoClinicoService` y dejan auditoría, también las de lectura. Una atención cerrada es
 * inmutable: solo admite enmiendas, que se muestran debajo del original. Recepción y administración no entran.
 */
@Injectable()
export class FichaService {
  constructor(
    @InjectRepository(Antecedente) private readonly antecedentes: Repository<Antecedente>,
    @InjectRepository(Atencion) private readonly atenciones: Repository<Atencion>,
    @InjectRepository(SignosVitales) private readonly signos: Repository<SignosVitales>,
    @InjectRepository(Diagnostico) private readonly diagnosticos: Repository<Diagnostico>,
    @InjectRepository(Examen) private readonly examenes: Repository<Examen>,
    @InjectRepository(Enmienda) private readonly enmiendas: Repository<Enmienda>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly acceso: AccesoClinicoService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
  ) {}

  // ───────────────────────── Acceso y auditoría ─────────────────────────

  /** Exige lectura, audita y devuelve el alcance. Con la relación cerrada, solo algunas partes admiten lectura propia. */
  private async leer(actor: UsuarioAutenticado, pacienteId: number, recurso: string, permitirSoloPropio = false): Promise<AlcanceLectura> {
    const alcance = await this.acceso.exigirLectura(actor, pacienteId);
    if (alcance.soloPropio && !permitirSoloPropio) throw new NotFoundException('Paciente no encontrado');
    await this.auditoria.registrar(actor, Accion.FICHA_LEER, { recurso, pacienteId });
    return alcance;
  }

  private async identificacion(pacienteId: number) {
    const [f] = await this.ds.query(
      `SELECT u.id, u.rut, u.nombres, u.apellido_paterno AS ap, u.apellido_materno AS am, u.telefono, u.correo,
              pp.fecha_nacimiento AS fechaNacimiento, pp.sexo, pp.direccion, pp.comuna,
              pp.emergencia_nombre AS emergenciaNombre, pp.emergencia_telefono AS emergenciaTelefono, pp.emergencia_parentesco AS emergenciaParentesco
       FROM usuarios u JOIN usuario_rol r ON r.usuario_id = u.id AND r.rol = 'PACIENTE' LEFT JOIN perfil_paciente pp ON pp.usuario_id = u.id WHERE u.id = ?`,
      [pacienteId],
    );
    if (!f) throw new NotFoundException('Paciente no encontrado');
    const fechaNacimiento = aFecha(f.fechaNacimiento);
    return {
      id: f.id,
      rut: formatearRut(f.rut),
      nombre: [f.nombres, f.ap, f.am].filter((x: string | null) => !!x).join(' '),
      edad: calcularEdad(fechaNacimiento),
      fechaNacimiento,
      sexo: f.sexo,
      telefono: f.telefono,
      correo: f.correo,
      direccion: f.direccion,
      comuna: f.comuna,
      emergencia: f.emergenciaNombre ? { nombre: f.emergenciaNombre, telefono: f.emergenciaTelefono, parentesco: f.emergenciaParentesco } : null,
    };
  }

  // ───────────────────────── Resumen ─────────────────────────

  /** Resumen al abrir la ficha: alergias, problemas activos, indicaciones activas y últimas atenciones. */
  async resumen(actor: UsuarioAutenticado, pacienteId: number) {
    const alcance = await this.leer(actor, pacienteId, 'ficha', true);
    const identificacion = await this.identificacion(pacienteId);
    const ultimas = await this.ds.query(
      `SELECT a.id, a.fecha, a.motivo, a.estado, ${nombreMedico('m')} AS medico, a.medico_id AS medicoId
       FROM atenciones a JOIN usuarios m ON m.id = a.medico_id
       WHERE a.paciente_id = ? AND (a.estado = 'CERRADA' OR a.medico_id = ?) ${alcance.soloPropio ? 'AND a.medico_id = ?' : ''}
       ORDER BY a.fecha DESC, a.id DESC LIMIT 5`,
      alcance.soloPropio ? [pacienteId, actor.id, actor.id] : [pacienteId, actor.id],
    );
    if (alcance.soloPropio) return { identificacion, soloPropio: true, ultimasAtenciones: ultimas };
    const alergias = await this.antecedentes.find({ where: { pacienteId, tipo: 'ALERGIA', vigente: true }, order: { createdAt: 'DESC' } });
    const problemas = await this.diagnosticos.find({ where: { pacienteId, estado: 'ACTIVO' }, order: { createdAt: 'DESC' } });
    const indicaciones = await this.ds.query(
      `SELECT r.id, r.titulo, r.tipo, r.fecha_fin AS fechaFin, ${nombreMedico('d')} AS doctor FROM recomendaciones r JOIN usuarios d ON d.id = r.doctor_id
       WHERE r.paciente_id = ? AND r.estado = 'ACTIVA' AND (r.fecha_fin IS NULL OR r.fecha_fin >= ?) ORDER BY r.created_at DESC LIMIT 10`,
      [pacienteId, hoyLocal()],
    );
    const [{ borradores }] = await this.ds.query(`SELECT COUNT(*) AS borradores FROM atenciones WHERE paciente_id = ? AND medico_id = ? AND estado = 'BORRADOR'`, [pacienteId, actor.id]);
    return {
      identificacion,
      soloPropio: false,
      alergias,
      problemasActivos: problemas,
      indicacionesActivas: indicaciones.map((i: any) => ({ ...i, fechaFin: aFecha(i.fechaFin) })),
      ultimasAtenciones: ultimas,
      borradoresPendientes: Number(borradores),
    };
  }

  // ───────────────────────── Antecedentes ─────────────────────────

  async listarAntecedentes(actor: UsuarioAutenticado, pacienteId: number, f: FiltroAntecedentesDto): Promise<Antecedente[]> {
    await this.leer(actor, pacienteId, 'antecedentes');
    const where: Record<string, unknown> = { pacienteId };
    if (f.tipo) where.tipo = f.tipo;
    if (f.soloVigentes) where.vigente = true;
    return this.antecedentes.find({ where, order: { vigente: 'DESC', createdAt: 'DESC' } });
  }

  async crearAntecedente(actor: UsuarioAutenticado, pacienteId: number, dto: CrearAntecedenteDto): Promise<Antecedente> {
    await this.acceso.exigirEscritura(actor, pacienteId);
    if (dto.tipo !== 'ALERGIA' && (dto.severidad || dto.reaccion)) throw new BadRequestException('La severidad y la reacción solo aplican a las alergias');
    if (dto.desde && dto.desde > hoyLocal()) throw new BadRequestException('La fecha no puede ser futura');
    const a = await this.antecedentes.save(
      this.antecedentes.create({
        pacienteId,
        tipo: dto.tipo,
        descripcion: dto.descripcion,
        detalle: dto.detalle ?? null,
        severidad: dto.severidad ?? null,
        reaccion: dto.reaccion ?? null,
        desde: dto.desde ?? null,
        vigente: true,
        registradoPor: actor.id,
      }),
    );
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'antecedente', recursoId: a.id, pacienteId, detalle: `crear ${dto.tipo}` });
    return a;
  }

  async editarAntecedente(actor: UsuarioAutenticado, id: number, dto: EditarAntecedenteDto): Promise<Antecedente> {
    const a = await this.antecedentes.findOneBy({ id });
    if (!a) throw new NotFoundException('Antecedente no encontrado');
    await this.acceso.exigirEscritura(actor, a.pacienteId);
    const cambios: Partial<Antecedente> = {};
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion;
    if (dto.detalle !== undefined) cambios.detalle = dto.detalle || null;
    if (dto.severidad !== undefined || dto.reaccion !== undefined) {
      if (a.tipo !== 'ALERGIA') throw new BadRequestException('La severidad y la reacción solo aplican a las alergias');
      if (dto.severidad !== undefined) cambios.severidad = dto.severidad;
      if (dto.reaccion !== undefined) cambios.reaccion = dto.reaccion || null;
    }
    if (dto.vigente === false && a.vigente) Object.assign(cambios, { vigente: false, cerradoEn: new Date() });
    if (dto.vigente === true && !a.vigente) Object.assign(cambios, { vigente: true, cerradoEn: null });
    if (Object.keys(cambios).length === 0) throw new BadRequestException('No hay cambios que guardar');
    await this.antecedentes.update({ id }, cambios);
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'antecedente', recursoId: id, pacienteId: a.pacienteId, detalle: Object.keys(cambios).join(',') });
    return this.antecedentes.findOneByOrFail({ id });
  }

  // ───────────────────────── Atenciones ─────────────────────────

  /** Historial de atenciones. Los borradores solo los ve su autor. */
  async listarAtenciones(actor: UsuarioAutenticado, pacienteId: number, f: FiltroAtencionesDto): Promise<Pagina<any>> {
    const alcance = await this.leer(actor, pacienteId, 'atenciones', true);
    const cond = `a.paciente_id = ? AND (a.estado = 'CERRADA' OR a.medico_id = ?) ${alcance.soloPropio ? 'AND a.medico_id = ?' : ''}`;
    const params = alcance.soloPropio ? [pacienteId, actor.id, actor.id] : [pacienteId, actor.id];
    const [{ total }] = await this.ds.query(`SELECT COUNT(*) AS total FROM atenciones a WHERE ${cond}`, params);
    const filas = await this.ds.query(
      `SELECT a.id, a.fecha, a.motivo, a.estado, a.cita_id AS citaId, a.medico_id AS medicoId, ${nombreMedico('m')} AS medico, e.nombre AS especialidad,
              (SELECT COUNT(*) FROM enmiendas en WHERE en.atencion_id = a.id) AS enmiendas
       FROM atenciones a JOIN usuarios m ON m.id = a.medico_id
       LEFT JOIN perfil_profesional pp ON pp.usuario_id = m.id LEFT JOIN especialidades e ON e.id = pp.especialidad_id
       WHERE ${cond} ORDER BY a.fecha DESC, a.id DESC LIMIT ? OFFSET ?`,
      [...params, f.tamano, desplazamiento(f)],
    );
    return armarPagina(filas.map((x: any) => ({ ...x, enmiendas: Number(x.enmiendas) })), Number(total), f);
  }

  /** Abre una atención en borrador, desde una cita o sin ella. */
  async crearAtencion(actor: UsuarioAutenticado, dto: CrearAtencionDto): Promise<Atencion> {
    await this.acceso.exigirEscritura(actor, dto.pacienteId);
    let fecha = new Date();
    if (dto.citaId) {
      const [c] = await this.ds.query('SELECT medico_id AS medicoId, paciente_id AS pacienteId, inicio FROM citas WHERE id = ?', [dto.citaId]);
      if (!c || c.medicoId !== actor.id || c.pacienteId !== dto.pacienteId) throw new BadRequestException('La cita no corresponde a este paciente o no es suya');
      const [previa] = await this.ds.query('SELECT id FROM atenciones WHERE cita_id = ? LIMIT 1', [dto.citaId]);
      if (previa) throw new ConflictException({ statusCode: 409, message: 'Ya existe una atención para esa cita', atencionId: previa.id });
      fecha = new Date(c.inicio);
    }
    const a = await this.atenciones.save(
      this.atenciones.create({
        pacienteId: dto.pacienteId,
        medicoId: actor.id,
        citaId: dto.citaId ?? null,
        fecha,
        motivo: dto.motivo,
        anamnesis: dto.anamnesis ?? null,
        examenFisico: dto.examenFisico ?? null,
        plan: dto.plan ?? null,
        observaciones: dto.observaciones ?? null,
        estado: 'BORRADOR',
        updatedAt: new Date(),
      }),
    );
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'atencion', recursoId: a.id, pacienteId: dto.pacienteId, detalle: 'abrir borrador' });
    return a;
  }

  private async cargarAtencion(id: number): Promise<Atencion> {
    const a = await this.atenciones.findOneBy({ id });
    if (!a) throw new NotFoundException('Atención no encontrada');
    return a;
  }

  /** Para modificar: relación vigente, ser el autor y que sea borrador. */
  private async exigirBorradorPropio(actor: UsuarioAutenticado, a: Atencion): Promise<void> {
    await this.acceso.exigirEscritura(actor, a.pacienteId);
    if (a.medicoId !== actor.id) {
      if (a.estado === 'BORRADOR') throw new NotFoundException('Atención no encontrada');
      throw new ForbiddenException('Solo el médico que la escribió puede modificarla');
    }
    if (a.estado === 'CERRADA') {
      throw new ConflictException({ statusCode: 409, message: 'La atención está cerrada y no se puede editar. Agregue una enmienda.', codigo: 'ATENCION_CERRADA' });
    }
  }

  /** Detalle de una atención con signos, enmiendas, diagnósticos, exámenes, documentos e indicaciones ligados. */
  async obtenerAtencion(actor: UsuarioAutenticado, id: number) {
    const a = await this.cargarAtencion(id);
    const alcance = await this.acceso.exigirLectura(actor, a.pacienteId);
    if ((alcance.soloPropio && a.medicoId !== actor.id) || (a.estado === 'BORRADOR' && a.medicoId !== actor.id)) throw new NotFoundException('Atención no encontrada');
    await this.auditoria.registrar(actor, Accion.FICHA_LEER, { recurso: 'atencion', recursoId: id, pacienteId: a.pacienteId });
    const [medico] = await this.ds.query(`SELECT ${nombreMedico('m')} AS nombre FROM usuarios m WHERE m.id = ?`, [a.medicoId]);
    const sv = await this.signos.findOneBy({ atencionId: id });
    return {
      ...a,
      medico: { id: a.medicoId, nombre: medico?.nombre },
      signosVitales: sv ? { ...sv, imc: calcularImc(sv.pesoKg, sv.tallaCm) } : null,
      enmiendasLista: await this.ds.query(
        `SELECT en.id, en.texto, en.motivo, en.created_at AS fecha, ${nombreMedico('u')} AS autor FROM enmiendas en JOIN usuarios u ON u.id = en.autor_id WHERE en.atencion_id = ? ORDER BY en.id`,
        [id],
      ),
      diagnosticos: await this.diagnosticos.find({ where: { atencionId: id }, order: { id: 'ASC' } }),
      examenes: await this.examenes.find({ where: { atencionId: id }, order: { id: 'ASC' } }),
      documentos: await this.ds.query(
        'SELECT id, nombre_original AS nombre, tipo_mime AS tipo, tamano, descripcion, created_at AS fecha FROM documentos WHERE atencion_id = ? AND anulado = 0 ORDER BY id',
        [id],
      ),
      indicaciones: await this.ds.query('SELECT id, titulo, tipo, estado FROM recomendaciones WHERE atencion_id = ? ORDER BY id', [id]),
    };
  }

  /** Guarda cambios en un borrador (el editor lo llama cada pocos segundos). */
  async editarAtencion(actor: UsuarioAutenticado, id: number, dto: EditarAtencionDto): Promise<Atencion> {
    const a = await this.cargarAtencion(id);
    await this.exigirBorradorPropio(actor, a);
    const cambios: Partial<Atencion> = { updatedAt: new Date() };
    if (dto.motivo !== undefined) cambios.motivo = dto.motivo;
    if (dto.anamnesis !== undefined) cambios.anamnesis = dto.anamnesis || null;
    if (dto.examenFisico !== undefined) cambios.examenFisico = dto.examenFisico || null;
    if (dto.plan !== undefined) cambios.plan = dto.plan || null;
    if (dto.observaciones !== undefined) cambios.observaciones = dto.observaciones || null;
    const r = await this.atenciones.update({ id, estado: 'BORRADOR' }, cambios);
    if (r.affected !== 1) throw new ConflictException('La atención ya fue cerrada');
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'atencion', recursoId: id, pacienteId: a.pacienteId, detalle: 'editar borrador' });
    return this.atenciones.findOneByOrFail({ id });
  }

  /** Guarda los signos vitales de un borrador. */
  async guardarSignos(actor: UsuarioAutenticado, id: number, dto: SignosVitalesDto) {
    const a = await this.cargarAtencion(id);
    await this.exigirBorradorPropio(actor, a);
    const valores = Object.values(dto).filter((v) => v !== undefined && v !== null);
    if (valores.length === 0) throw new BadRequestException('Ingrese al menos un valor');
    if ((dto.paSistolica === undefined) !== (dto.paDiastolica === undefined)) throw new BadRequestException('Ingrese la presión sistólica y la diastólica');
    if (dto.paSistolica !== undefined && dto.paDiastolica !== undefined && dto.paSistolica <= dto.paDiastolica) {
      throw new BadRequestException('La presión sistólica debe ser mayor que la diastólica');
    }
    await this.signos.save(
      this.signos.create({
        atencionId: id,
        pacienteId: a.pacienteId,
        paSistolica: dto.paSistolica ?? null,
        paDiastolica: dto.paDiastolica ?? null,
        frecuenciaCardiaca: dto.frecuenciaCardiaca ?? null,
        frecuenciaRespiratoria: dto.frecuenciaRespiratoria ?? null,
        temperatura: dto.temperatura ?? null,
        saturacion: dto.saturacion ?? null,
        pesoKg: dto.pesoKg ?? null,
        tallaCm: dto.tallaCm ?? null,
      }),
    );
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'signos_vitales', recursoId: id, pacienteId: a.pacienteId });
    const sv = await this.signos.findOneByOrFail({ atencionId: id });
    return { ...sv, imc: calcularImc(sv.pesoKg, sv.tallaCm) };
  }

  /** Cierra la atención. Desde ahí no se edita; solo admite enmiendas. */
  async cerrarAtencion(actor: UsuarioAutenticado, id: number): Promise<Atencion> {
    const a = await this.cargarAtencion(id);
    await this.exigirBorradorPropio(actor, a);
    if (!a.motivo.trim()) throw new BadRequestException('Falta el motivo de consulta');
    if (![a.anamnesis, a.examenFisico, a.plan].some((t) => t && t.trim())) {
      throw new BadRequestException('Para cerrar la atención escriba la anamnesis, el examen físico o el plan');
    }
    const r = await this.atenciones.update({ id, estado: 'BORRADOR' }, { estado: 'CERRADA', cerradaEn: new Date(), updatedAt: new Date() });
    if (r.affected !== 1) throw new ConflictException('La atención ya fue cerrada');
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'atencion', recursoId: id, pacienteId: a.pacienteId, detalle: 'cerrar' });
    return this.atenciones.findOneByOrFail({ id });
  }

  /** Agrega una corrección a una atención cerrada. El texto original sigue visible. */
  async agregarEnmienda(actor: UsuarioAutenticado, id: number, dto: EnmiendaDto) {
    const a = await this.cargarAtencion(id);
    await this.acceso.exigirEscritura(actor, a.pacienteId);
    if (a.medicoId !== actor.id) throw new ForbiddenException('Solo el médico que la escribió puede enmendarla');
    if (a.estado !== 'CERRADA') throw new BadRequestException('Solo se enmienda una atención cerrada; un borrador se edita directamente');
    const e = await this.enmiendas.save(this.enmiendas.create({ atencionId: id, texto: dto.texto, motivo: dto.motivo, autorId: actor.id }));
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'enmienda', recursoId: e.id, pacienteId: a.pacienteId, detalle: `atencion ${id}` });
    return e;
  }

  /** Serie de signos vitales del paciente, para graficar. */
  async serieSignos(actor: UsuarioAutenticado, pacienteId: number) {
    await this.leer(actor, pacienteId, 'signos_vitales');
    const filas = await this.ds.query(
      `SELECT a.id AS atencionId, a.fecha, sv.pa_sistolica AS paSistolica, sv.pa_diastolica AS paDiastolica, sv.frecuencia_cardiaca AS frecuenciaCardiaca,
              sv.frecuencia_respiratoria AS frecuenciaRespiratoria, sv.temperatura, sv.saturacion, sv.peso_kg AS pesoKg, sv.talla_cm AS tallaCm
       FROM signos_vitales sv JOIN atenciones a ON a.id = sv.atencion_id
       WHERE sv.paciente_id = ? AND a.estado = 'CERRADA' ORDER BY a.fecha`,
      [pacienteId],
    );
    return filas.map((f: any) => {
      const peso = f.pesoKg === null ? null : Number(f.pesoKg);
      const talla = f.tallaCm === null ? null : Number(f.tallaCm);
      return { ...f, temperatura: f.temperatura === null ? null : Number(f.temperatura), pesoKg: peso, tallaCm: talla, imc: calcularImc(peso, talla) };
    });
  }

  // ───────────────────────── Diagnósticos ─────────────────────────

  async listarDiagnosticos(actor: UsuarioAutenticado, pacienteId: number, estado?: string): Promise<Diagnostico[]> {
    await this.leer(actor, pacienteId, 'diagnosticos');
    return this.diagnosticos.find({ where: { pacienteId, ...(estado ? { estado: estado as Diagnostico['estado'] } : {}) }, order: { createdAt: 'DESC' } });
  }

  private async exigirAtencionPropia(actor: UsuarioAutenticado, atencionId: number | undefined, pacienteId: number): Promise<void> {
    if (!atencionId) return;
    const a = await this.atenciones.findOneBy({ id: atencionId });
    if (!a || a.pacienteId !== pacienteId || a.medicoId !== actor.id) throw new BadRequestException('La atención indicada no existe o no es suya');
  }

  async crearDiagnostico(actor: UsuarioAutenticado, pacienteId: number, dto: CrearDiagnosticoDto): Promise<Diagnostico> {
    await this.acceso.exigirEscritura(actor, pacienteId);
    await this.exigirAtencionPropia(actor, dto.atencionId, pacienteId);
    const d = await this.diagnosticos.save(
      this.diagnosticos.create({
        pacienteId,
        atencionId: dto.atencionId ?? null,
        descripcion: dto.descripcion,
        codigoCie10: dto.codigoCie10 ? dto.codigoCie10.toUpperCase() : null,
        principal: dto.principal ?? false,
        estado: 'ACTIVO',
        registradoPor: actor.id,
      }),
    );
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'diagnostico', recursoId: d.id, pacienteId, detalle: 'crear' });
    return d;
  }

  /** Marca un diagnóstico como resuelto o descartado. El texto no se edita: un diagnóstico erróneo se descarta y se crea otro. */
  async editarDiagnostico(actor: UsuarioAutenticado, id: number, dto: EditarDiagnosticoDto): Promise<Diagnostico> {
    const d = await this.diagnosticos.findOneBy({ id });
    if (!d) throw new NotFoundException('Diagnóstico no encontrado');
    await this.acceso.exigirEscritura(actor, d.pacienteId);
    const cambios: Partial<Diagnostico> = {};
    if (dto.estado && dto.estado !== d.estado) {
      cambios.estado = dto.estado;
      cambios.resueltoEn = dto.estado === 'ACTIVO' ? null : new Date();
    }
    if (dto.principal !== undefined) cambios.principal = dto.principal;
    if (Object.keys(cambios).length === 0) throw new BadRequestException('No hay cambios que guardar');
    await this.diagnosticos.update({ id }, cambios);
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'diagnostico', recursoId: id, pacienteId: d.pacienteId, detalle: Object.keys(cambios).join(',') });
    return this.diagnosticos.findOneByOrFail({ id });
  }

  // ───────────────────────── Exámenes ─────────────────────────

  async listarExamenes(actor: UsuarioAutenticado, pacienteId: number, estado?: string): Promise<Examen[]> {
    await this.leer(actor, pacienteId, 'examenes');
    return this.examenes.find({ where: { pacienteId, ...(estado ? { estado: estado as Examen['estado'] } : {}) }, order: { createdAt: 'DESC' } });
  }

  async crearExamen(actor: UsuarioAutenticado, pacienteId: number, dto: CrearExamenDto): Promise<Examen> {
    await this.acceso.exigirEscritura(actor, pacienteId);
    await this.exigirAtencionPropia(actor, dto.atencionId, pacienteId);
    const e = await this.examenes.save(
      this.examenes.create({ pacienteId, atencionId: dto.atencionId ?? null, nombre: dto.nombre, tipo: dto.tipo, indicaciones: dto.indicaciones ?? null, estado: 'SOLICITADO', solicitadoPor: actor.id }),
    );
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'examen', recursoId: e.id, pacienteId, detalle: 'solicitar' });
    return e;
  }

  /** Registra el resultado (una sola vez) o anula un examen aún no realizado. */
  async editarExamen(actor: UsuarioAutenticado, id: number, dto: EditarExamenDto): Promise<Examen> {
    const e = await this.examenes.findOneBy({ id });
    if (!e) throw new NotFoundException('Examen no encontrado');
    await this.acceso.exigirEscritura(actor, e.pacienteId);
    if (e.estado !== 'SOLICITADO') throw new ConflictException('El examen ya tiene resultado o fue anulado y no se modifica');
    if (dto.anular) {
      await this.examenes.update({ id }, { estado: 'ANULADO' });
    } else if (dto.resultado) {
      if (dto.fechaResultado && dto.fechaResultado > hoyLocal()) throw new BadRequestException('La fecha del resultado no puede ser futura');
      await this.examenes.update({ id }, { estado: 'CON_RESULTADO', resultado: dto.resultado, fechaResultado: dto.fechaResultado ?? hoyLocal() });
    } else {
      throw new BadRequestException('Indique el resultado o anule el examen');
    }
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'examen', recursoId: id, pacienteId: e.pacienteId, detalle: dto.anular ? 'anular' : 'resultado' });
    return this.examenes.findOneByOrFail({ id });
  }

  // ───────────────────────── Ficha completa, exportación y vista del paciente ─────────────────────────

  /**
   * Arma la ficha completa para imprimirla o exportarla. La vista del paciente omite la anamnesis, el examen físico
   * y las observaciones del médico, y solo incluye exámenes con resultado.
   */
  private async construirFicha(pacienteId: number, vista: 'medico' | 'paciente', soloMedicoId?: number) {
    const paciente = await this.identificacion(pacienteId);
    const antecedentes = await this.antecedentes.find({ where: { pacienteId }, order: { tipo: 'ASC', createdAt: 'DESC' } });
    const filtroMedico = soloMedicoId ? ' AND a.medico_id = ?' : '';
    const atenciones = await this.ds.query(
      `SELECT a.id, a.fecha, a.motivo, a.anamnesis, a.examen_fisico AS examenFisico, a.plan, a.observaciones, ${nombreMedico('m')} AS medico, e.nombre AS especialidad
       FROM atenciones a JOIN usuarios m ON m.id = a.medico_id LEFT JOIN perfil_profesional pp ON pp.usuario_id = m.id LEFT JOIN especialidades e ON e.id = pp.especialidad_id
       WHERE a.paciente_id = ? AND a.estado = 'CERRADA'${filtroMedico} ORDER BY a.fecha DESC, a.id DESC`,
      soloMedicoId ? [pacienteId, soloMedicoId] : [pacienteId],
    );
    const ids = atenciones.map((a: any) => a.id);
    const marcas = ids.map(() => '?').join(',');
    const enmiendas = ids.length ? await this.ds.query(`SELECT atencion_id AS atencionId, texto, motivo, created_at AS fecha FROM enmiendas WHERE atencion_id IN (${marcas}) ORDER BY id`, ids) : [];
    const signos = ids.length ? await this.ds.query(`SELECT * FROM signos_vitales WHERE atencion_id IN (${marcas})`, ids) : [];
    const diagnosticos = await this.diagnosticos.find({ where: { pacienteId }, order: { createdAt: 'DESC' } });
    const dxPorAtencion = (id: number) => diagnosticos.filter((d) => d.atencionId === id).map((d) => ({ descripcion: d.descripcion, codigoCie10: d.codigoCie10, estado: d.estado }));
    const examenes = (await this.examenes.find({ where: { pacienteId }, order: { createdAt: 'DESC' } })).filter((e) => vista === 'medico' || e.estado === 'CON_RESULTADO');
    const documentos = await this.ds.query(
      `SELECT id, nombre_original AS nombre, tipo_mime AS tipo, tamano, descripcion, created_at AS fecha, atencion_id AS atencionId, examen_id AS examenId FROM documentos WHERE paciente_id = ? AND anulado = 0 ORDER BY id DESC`,
      [pacienteId],
    );
    const indicaciones = await this.ds.query(
      `SELECT r.id, r.titulo, r.tipo, r.estado, r.fecha_inicio AS fechaInicio, r.fecha_fin AS fechaFin, r.medicamento, r.dosis, r.via, ${nombreMedico('d')} AS doctor
       FROM recomendaciones r JOIN usuarios d ON d.id = r.doctor_id WHERE r.paciente_id = ?${soloMedicoId ? ' AND r.doctor_id = ?' : ''} ORDER BY r.created_at DESC`,
      soloMedicoId ? [pacienteId, soloMedicoId] : [pacienteId],
    );
    return {
      paciente,
      antecedentes,
      atenciones: atenciones.map((a: any) => {
        const sv = signos.find((s: any) => s.atencion_id === a.id);
        const base = { id: a.id, fecha: a.fecha, medico: a.medico, especialidad: a.especialidad, motivo: a.motivo, diagnosticos: dxPorAtencion(a.id) };
        if (vista === 'paciente') return base;
        return {
          ...base,
          anamnesis: a.anamnesis,
          examenFisico: a.examenFisico,
          plan: a.plan,
          observaciones: a.observaciones,
          signosVitales: sv ? { paSistolica: sv.pa_sistolica, paDiastolica: sv.pa_diastolica, frecuenciaCardiaca: sv.frecuencia_cardiaca, frecuenciaRespiratoria: sv.frecuencia_respiratoria, temperatura: sv.temperatura === null ? null : Number(sv.temperatura), saturacion: sv.saturacion, pesoKg: sv.peso_kg === null ? null : Number(sv.peso_kg), tallaCm: sv.talla_cm === null ? null : Number(sv.talla_cm) } : null,
          enmiendas: enmiendas.filter((e: any) => e.atencionId === a.id),
        };
      }),
      diagnosticos,
      examenes,
      indicaciones: indicaciones.map((i: any) => ({ ...i, fechaInicio: aFecha(i.fechaInicio), fechaFin: aFecha(i.fechaFin) })),
      documentos,
    };
  }

  /** Ficha completa de un paciente para un médico con relación (se puede imprimir o guardar como PDF). */
  async exportar(actor: UsuarioAutenticado, pacienteId: number) {
    const alcance = await this.acceso.exigirLectura(actor, pacienteId);
    await this.auditoria.registrar(actor, Accion.FICHA_EXPORTAR, { recurso: 'ficha', pacienteId });
    const ficha = await this.construirFicha(pacienteId, 'medico', alcance.soloPropio ? actor.id : undefined);
    const [g] = await this.ds.query(`SELECT ${nombreMedico('u')} AS nombre FROM usuarios u WHERE u.id = ?`, [actor.id]);
    return { centro: await this.config.texto('centro_nombre'), generadoEn: new Date(), generadoPor: g?.nombre, ...ficha };
  }

  /** Lo que el paciente puede ver de su propia ficha. */
  async miFicha(actor: UsuarioAutenticado) {
    return this.construirFicha(actor.id, 'paciente');
  }

  /** La ficha del paciente, lista para imprimir. */
  async miFichaExportar(actor: UsuarioAutenticado) {
    const ficha = await this.construirFicha(actor.id, 'paciente');
    return { centro: await this.config.texto('centro_nombre'), generadoEn: new Date(), generadoPor: ficha.paciente.nombre, ...ficha };
  }
}
