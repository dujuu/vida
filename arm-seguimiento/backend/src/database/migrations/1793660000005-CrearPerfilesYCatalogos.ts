import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLA = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Crea los perfiles de médico y de paciente, el catálogo de especialidades, los consentimientos, las fusiones de
 * pacientes, la configuración del sistema y los feriados. Traslada los datos antiguos de `usuarios` y quita
 * sus columnas `nombre`, `rol` y `especialidad`.
 */
export class CrearPerfilesYCatalogos1793660000005 implements MigrationInterface {
  name = 'CrearPerfilesYCatalogos1793660000005';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE especialidades (
        id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(80) NOT NULL,
        activa TINYINT(1) NOT NULL DEFAULT 1,
        PRIMARY KEY (id),
        UNIQUE KEY uq_especialidad_nombre (nombre)
      ) ${TABLA}
    `);
    await q.query(
      `INSERT INTO especialidades (nombre) VALUES ('Medicina General'), ('Pediatría'), ('Ginecología'), ('Kinesiología'), ('Nutrición'), ('Psicología')`,
    );
    await q.query(`INSERT IGNORE INTO especialidades (nombre) SELECT DISTINCT especialidad FROM usuarios WHERE especialidad IS NOT NULL`);
    await q.query(`
      CREATE TABLE perfil_profesional (
        usuario_id           INT UNSIGNED NOT NULL,
        especialidad_id      INT UNSIGNED NOT NULL,
        registro_profesional VARCHAR(30) NULL,
        duracion_cita_min    SMALLINT UNSIGNED NOT NULL DEFAULT 30,
        acepta_reservas      TINYINT(1) NOT NULL DEFAULT 1,
        presentacion         VARCHAR(300) NULL,
        PRIMARY KEY (usuario_id),
        CONSTRAINT fk_pp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE RESTRICT,
        CONSTRAINT fk_pp_especialidad FOREIGN KEY (especialidad_id) REFERENCES especialidades (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      INSERT INTO perfil_profesional (usuario_id, especialidad_id)
      SELECT u.id, COALESCE(e.id, (SELECT id FROM especialidades WHERE nombre = 'Medicina General'))
      FROM usuarios u LEFT JOIN especialidades e ON e.nombre = u.especialidad
      WHERE u.rol = 'DOCTOR'
    `);
    await q.query(`
      CREATE TABLE perfil_paciente (
        usuario_id            INT UNSIGNED NOT NULL,
        fecha_nacimiento      DATE NULL,
        sexo                  ENUM('F','M','O') NULL,
        direccion             VARCHAR(200) NULL,
        comuna                VARCHAR(80) NULL,
        emergencia_nombre     VARCHAR(120) NULL,
        emergencia_telefono   VARCHAR(20) NULL,
        emergencia_parentesco VARCHAR(40) NULL,
        medio_contacto        ENUM('LLAMADA','WHATSAPP','CORREO') NULL,
        acepta_recordatorios  TINYINT(1) NOT NULL DEFAULT 1,
        registrado_por        INT UNSIGNED NULL,
        PRIMARY KEY (usuario_id),
        CONSTRAINT fk_ppac_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`INSERT INTO perfil_paciente (usuario_id) SELECT id FROM usuarios WHERE rol = 'PACIENTE'`);
    await q.query(`
      CREATE TABLE consentimientos (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        paciente_id    INT UNSIGNED NOT NULL,
        version        SMALLINT UNSIGNED NOT NULL,
        medio          ENUM('APP','PRESENCIAL') NOT NULL,
        aceptado_en    DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        registrado_por INT UNSIGNED NULL,
        PRIMARY KEY (id),
        KEY idx_cons_paciente (paciente_id),
        CONSTRAINT fk_cons_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE fusiones (
        id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
        conservado_id INT UNSIGNED NOT NULL,
        fusionado_id  INT UNSIGNED NOT NULL,
        motivo       VARCHAR(200) NOT NULL,
        hecha_por    INT UNSIGNED NOT NULL,
        created_at   DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id)
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE configuracion (
        clave          VARCHAR(60) NOT NULL,
        valor          VARCHAR(200) NOT NULL,
        descripcion    VARCHAR(200) NOT NULL,
        modificado_por INT UNSIGNED NULL,
        updated_at     DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (clave)
      ) ${TABLA}
    `);
    await q.query(`
      INSERT INTO configuracion (clave, valor, descripcion) VALUES
        ('centro_nombre', 'Centro Médico Vida Norte', 'Nombre del centro, para encabezados e impresión'),
        ('cita_duracion_min', '30', 'Duración de cita por defecto, en minutos'),
        ('cancelacion_horas', '12', 'Horas de anticipación hasta las que el paciente puede cancelar o reprogramar'),
        ('reserva_antelacion_min_horas', '2', 'Antelación mínima para que un paciente reserve, en horas'),
        ('reserva_antelacion_max_dias', '60', 'Antelación máxima para que un paciente reserve, en días'),
        ('citas_futuras_max', '3', 'Máximo de citas futuras activas por paciente'),
        ('sesion_paciente_dias', '30', 'Duración de la sesión del paciente, en días'),
        ('sesion_personal_horas', '12', 'Duración de la sesión del personal, en horas'),
        ('login_intentos_max', '5', 'Intentos fallidos de inicio de sesión antes de bloquear'),
        ('login_bloqueo_min', '15', 'Minutos de bloqueo tras superar los intentos'),
        ('codigo_vigencia_horas', '48', 'Vigencia de los códigos de activación y recuperación, en horas'),
        ('toma_plazo_dias', '1', 'Días después de la toma programada hasta los que se puede marcar'),
        ('aviso_toma_minutos', '60', 'Minutos de anticipación con que se destaca una toma por vencer'),
        ('contactos_tope_salientes', '2', 'Contactos salientes a un paciente en 7 días antes de advertir'),
        ('continuidad_riesgo_dias', '3', 'Días sin registro para considerar a un paciente en riesgo'),
        ('continuidad_desercion_dias', '30', 'Días sin actividad para considerar a un paciente desertor'),
        ('avisos_tope_diario', '6', 'Máximo de avisos no clínicos por paciente y día'),
        ('clave_unica_simulada', '1', 'Activa la Clave Única simulada (1 sí, 0 no)'),
        ('consentimiento_version', '1', 'Versión vigente del texto de consentimiento')
    `);
    await q.query(`
      CREATE TABLE feriados (
        fecha  DATE NOT NULL,
        nombre VARCHAR(80) NOT NULL,
        PRIMARY KEY (fecha)
      ) ${TABLA}
    `);
    await q.query('ALTER TABLE usuarios DROP COLUMN nombre, DROP COLUMN rol, DROP COLUMN especialidad');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE usuarios
        ADD COLUMN nombre VARCHAR(120) NOT NULL DEFAULT '',
        ADD COLUMN rol ENUM('DOCTOR','PACIENTE') NOT NULL DEFAULT 'PACIENTE',
        ADD COLUMN especialidad VARCHAR(80) NULL
    `);
    await q.query(`UPDATE usuarios SET nombre = TRIM(CONCAT_WS(' ', titulo, nombres, apellido_paterno, apellido_materno))`);
    await q.query(`UPDATE usuarios u JOIN usuario_rol r ON r.usuario_id = u.id AND r.rol = 'MEDICO' SET u.rol = 'DOCTOR'`);
    await q.query(`
      UPDATE usuarios u JOIN perfil_profesional p ON p.usuario_id = u.id JOIN especialidades e ON e.id = p.especialidad_id
      SET u.especialidad = e.nombre
    `);
    for (const t of ['feriados', 'configuracion', 'fusiones', 'consentimientos', 'perfil_paciente', 'perfil_profesional', 'especialidades']) {
      await q.query(`DROP TABLE ${t}`);
    }
  }
}
