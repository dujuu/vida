import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLA = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/** Crea las tablas de la ficha clínica: antecedentes, atenciones, signos vitales, diagnósticos, exámenes, documentos y enmiendas. */
export class CrearFichaClinica1793660000009 implements MigrationInterface {
  name = 'CrearFichaClinica1793660000009';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE antecedentes (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        paciente_id    INT UNSIGNED NOT NULL,
        tipo           ENUM('MORBIDO','QUIRURGICO','FAMILIAR','ALERGIA','HABITO','MEDICAMENTO') NOT NULL,
        descripcion    VARCHAR(200) NOT NULL,
        detalle        VARCHAR(1000) NULL,
        severidad      ENUM('LEVE','MODERADA','GRAVE') NULL,
        reaccion       VARCHAR(200) NULL,
        desde          DATE NULL,
        vigente        TINYINT(1) NOT NULL DEFAULT 1,
        cerrado_en     DATETIME(6) NULL,
        registrado_por INT UNSIGNED NOT NULL,
        created_at     DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_ant_paciente (paciente_id, tipo),
        CONSTRAINT fk_ant_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE atenciones (
        id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
        paciente_id   INT UNSIGNED NOT NULL,
        medico_id     INT UNSIGNED NOT NULL,
        cita_id       INT UNSIGNED NULL,
        fecha         DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        motivo        VARCHAR(300) NOT NULL,
        anamnesis     TEXT NULL,
        examen_fisico TEXT NULL,
        plan          TEXT NULL,
        observaciones TEXT NULL,
        estado        ENUM('BORRADOR','CERRADA') NOT NULL DEFAULT 'BORRADOR',
        cerrada_en    DATETIME(6) NULL,
        created_at    DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        updated_at    DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_at_paciente (paciente_id, fecha),
        KEY idx_at_medico (medico_id, estado),
        CONSTRAINT fk_at_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT,
        CONSTRAINT fk_at_medico FOREIGN KEY (medico_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE signos_vitales (
        atencion_id            INT UNSIGNED NOT NULL,
        paciente_id            INT UNSIGNED NOT NULL,
        pa_sistolica           SMALLINT UNSIGNED NULL,
        pa_diastolica          SMALLINT UNSIGNED NULL,
        frecuencia_cardiaca    SMALLINT UNSIGNED NULL,
        frecuencia_respiratoria SMALLINT UNSIGNED NULL,
        temperatura            DECIMAL(4,1) NULL,
        saturacion             TINYINT UNSIGNED NULL,
        peso_kg                DECIMAL(5,1) NULL,
        talla_cm               DECIMAL(5,1) NULL,
        PRIMARY KEY (atencion_id),
        KEY idx_sv_paciente (paciente_id),
        CONSTRAINT fk_sv_atencion FOREIGN KEY (atencion_id) REFERENCES atenciones (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE diagnosticos (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        paciente_id    INT UNSIGNED NOT NULL,
        atencion_id    INT UNSIGNED NULL,
        descripcion    VARCHAR(300) NOT NULL,
        codigo_cie10   VARCHAR(10) NULL,
        principal      TINYINT(1) NOT NULL DEFAULT 0,
        estado         ENUM('ACTIVO','RESUELTO','DESCARTADO') NOT NULL DEFAULT 'ACTIVO',
        resuelto_en    DATETIME(6) NULL,
        registrado_por INT UNSIGNED NOT NULL,
        created_at     DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_dg_paciente (paciente_id, estado),
        CONSTRAINT fk_dg_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE examenes (
        id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
        paciente_id     INT UNSIGNED NOT NULL,
        atencion_id     INT UNSIGNED NULL,
        nombre          VARCHAR(150) NOT NULL,
        tipo            ENUM('LABORATORIO','IMAGEN','OTRO') NOT NULL,
        indicaciones    VARCHAR(500) NULL,
        estado          ENUM('SOLICITADO','CON_RESULTADO','ANULADO') NOT NULL DEFAULT 'SOLICITADO',
        fecha_resultado DATE NULL,
        resultado       TEXT NULL,
        solicitado_por  INT UNSIGNED NOT NULL,
        created_at      DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_ex_paciente (paciente_id, estado),
        CONSTRAINT fk_ex_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE documentos (
        id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
        paciente_id     INT UNSIGNED NOT NULL,
        atencion_id     INT UNSIGNED NULL,
        examen_id       INT UNSIGNED NULL,
        nombre_original VARCHAR(200) NOT NULL,
        tipo_mime       VARCHAR(60) NOT NULL,
        tamano          INT UNSIGNED NOT NULL,
        ruta            VARCHAR(80) NOT NULL,
        huella          CHAR(64) NOT NULL,
        descripcion     VARCHAR(200) NULL,
        subido_por      INT UNSIGNED NOT NULL,
        anulado         TINYINT(1) NOT NULL DEFAULT 0,
        created_at      DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_doc_paciente (paciente_id),
        CONSTRAINT fk_doc_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE enmiendas (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        atencion_id INT UNSIGNED NOT NULL,
        texto       TEXT NOT NULL,
        motivo      VARCHAR(200) NOT NULL,
        autor_id    INT UNSIGNED NOT NULL,
        created_at  DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_en_atencion (atencion_id),
        CONSTRAINT fk_en_atencion FOREIGN KEY (atencion_id) REFERENCES atenciones (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['enmiendas', 'documentos', 'examenes', 'diagnosticos', 'signos_vitales', 'atenciones', 'antecedentes']) {
      await q.query(`DROP TABLE ${t}`);
    }
  }
}
