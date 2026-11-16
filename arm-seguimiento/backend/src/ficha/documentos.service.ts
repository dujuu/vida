import { BadRequestException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { AccesoClinicoService } from '../asignaciones/acceso-clinico.service.js';
import { Accion, AuditoriaService } from '../auditoria/auditoria.service.js';
import { sha256 } from '../auth/seguridad.util.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../usuarios/rol.enum.js';
import { TAMANO_MAXIMO_DOCUMENTO, TIPOS_DOCUMENTO as TIPOS, firmaCoincide, limpiarNombreArchivo } from './archivos.util.js';
import type { SubirDocumentoDto } from './ficha.dto.js';
import { Documento } from './ficha.entities.js';

/**
 * Documentos adjuntos a la ficha (PDF, JPG y PNG de hasta 10 MB). Los archivos se guardan en una carpeta del
 * servidor fuera de la web pública, con un nombre interno aleatorio, y solo se entregan por una ruta protegida.
 * Al descargar se verifica la huella SHA-256 para detectar alteraciones. La carpeta entra en el respaldo diario.
 */
@Injectable()
export class DocumentosService implements OnModuleInit {
  private readonly carpeta = resolve(process.env.ARCHIVOS_DIR ?? './archivos');

  constructor(
    @InjectRepository(Documento) private readonly docs: Repository<Documento>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly acceso: AccesoClinicoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.carpeta, { recursive: true });
  }

  /** Sube un archivo a la ficha de un paciente. */
  async subir(actor: UsuarioAutenticado, pacienteId: number, archivo: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined, dto: SubirDocumentoDto): Promise<Documento> {
    await this.acceso.exigirEscritura(actor, pacienteId);
    if (!archivo) throw new BadRequestException('Adjunte un archivo en el campo "archivo"');
    if (!TIPOS[archivo.mimetype]) throw new BadRequestException('Solo se permiten archivos PDF, JPG o PNG');
    if (archivo.size > TAMANO_MAXIMO_DOCUMENTO || archivo.buffer.length > TAMANO_MAXIMO_DOCUMENTO) throw new BadRequestException('El archivo no puede superar los 10 MB');
    if (archivo.buffer.length === 0) throw new BadRequestException('El archivo está vacío');
    if (!firmaCoincide(archivo.buffer, archivo.mimetype)) throw new BadRequestException('El contenido del archivo no corresponde a su tipo');
    if (dto.atencionId) {
      const [a] = await this.ds.query('SELECT 1 AS ok FROM atenciones WHERE id = ? AND paciente_id = ?', [dto.atencionId, pacienteId]);
      if (!a) throw new BadRequestException('La atención indicada no pertenece a este paciente');
    }
    if (dto.examenId) {
      const [e] = await this.ds.query('SELECT 1 AS ok FROM examenes WHERE id = ? AND paciente_id = ?', [dto.examenId, pacienteId]);
      if (!e) throw new BadRequestException('El examen indicado no pertenece a este paciente');
    }
    const ruta = `${randomBytes(16).toString('hex')}.${TIPOS[archivo.mimetype].extension}`;
    await writeFile(join(this.carpeta, ruta), archivo.buffer, { mode: 0o600 });
    const doc = await this.docs.save(
      this.docs.create({
        pacienteId,
        atencionId: dto.atencionId ?? null,
        examenId: dto.examenId ?? null,
        nombreOriginal: limpiarNombreArchivo(archivo.originalname),
        tipoMime: archivo.mimetype,
        tamano: archivo.buffer.length,
        ruta,
        huella: sha256(archivo.buffer),
        descripcion: dto.descripcion ?? null,
        subidoPor: actor.id,
        anulado: false,
      }),
    );
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'documento', recursoId: doc.id, pacienteId, detalle: 'subir' });
    return doc;
  }

  /** Documentos de un paciente (sin los anulados). */
  async listar(actor: UsuarioAutenticado, pacienteId: number) {
    const alcance = await this.acceso.exigirLectura(actor, pacienteId);
    if (alcance.soloPropio) throw new NotFoundException('Paciente no encontrado');
    await this.auditoria.registrar(actor, Accion.FICHA_LEER, { recurso: 'documentos', pacienteId });
    return this.ds.query(
      `SELECT id, nombre_original AS nombre, tipo_mime AS tipo, tamano, descripcion, created_at AS fecha, atencion_id AS atencionId, examen_id AS examenId
       FROM documentos WHERE paciente_id = ? AND anulado = 0 ORDER BY id DESC`,
      [pacienteId],
    );
  }

  /**
   * Entrega el contenido de un documento al paciente dueño o a un médico con relación.
   *
   * @throws NotFoundException si no existe, está anulado o es de otro paciente.
   * @throws Error si el archivo fue alterado en disco (la huella no coincide).
   */
  async descargar(actor: UsuarioAutenticado, id: number): Promise<{ doc: Documento; contenido: Buffer }> {
    const doc = await this.docs.findOneBy({ id });
    if (!doc || doc.anulado) throw new NotFoundException('Documento no encontrado');
    if (actor.rol === Rol.PACIENTE) {
      if (doc.pacienteId !== actor.id) throw new NotFoundException('Documento no encontrado');
    } else {
      const alcance = await this.acceso.exigirLectura(actor, doc.pacienteId);
      if (alcance.soloPropio && doc.subidoPor !== actor.id) throw new NotFoundException('Documento no encontrado');
    }
    if (!/^[a-f0-9]{32}\.(pdf|jpg|png)$/.test(doc.ruta)) throw new NotFoundException('Documento no encontrado');
    await this.auditoria.registrar(actor, Accion.DOCUMENTO_DESCARGAR, { recurso: 'documento', recursoId: id, pacienteId: doc.pacienteId });
    let contenido: Buffer;
    try {
      contenido = await readFile(join(this.carpeta, doc.ruta));
    } catch {
      throw new NotFoundException('El archivo no está disponible en el servidor');
    }
    if (sha256(contenido) !== doc.huella) throw new Error('El archivo fue alterado: la huella no coincide');
    return { doc, contenido };
  }

  /** Anula un documento (el archivo se conserva en disco). Solo quien lo subió. */
  async anular(actor: UsuarioAutenticado, id: number): Promise<void> {
    const doc = await this.docs.findOneBy({ id });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.acceso.exigirEscritura(actor, doc.pacienteId);
    if (doc.subidoPor !== actor.id) throw new BadRequestException('Solo quien subió el documento puede anularlo');
    await this.docs.update({ id }, { anulado: true });
    await this.auditoria.registrar(actor, Accion.FICHA_ESCRIBIR, { recurso: 'documento', recursoId: id, pacienteId: doc.pacienteId, detalle: 'anular' });
  }
}
