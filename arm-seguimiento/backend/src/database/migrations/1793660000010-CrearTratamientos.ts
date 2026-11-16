import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLA = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Amplía `recomendaciones` con vigencia, estado, versiones y datos de medicamento, y crea las pautas y los
 * eventos de tratamiento que alimentan el calendario del paciente.
 */
export class CrearTratamientos1793660000010 implements MigrationInterface {
  name = 'CrearTratamientos1793660000010';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE recomendaciones
        ADD COLUMN atencion_id INT UNSIGNED NULL,
        ADD COLUMN fecha_inicio DATE NULL,
        ADD COLUMN fecha_fin DATE NULL,
        ADD COLUMN estado ENUM('ACTIVA','SUSPENDIDA','FINALIZADA','ANULADA') NOT NULL DEFAULT 'ACTIVA',
        ADD COLUMN motivo_suspension VARCHAR(200) NULL,
        ADD COLUMN suspendida_por INT UNSIGNED NULL,
        ADD COLUMN suspendida_en DATETIME(6) NULL,
        ADD COLUMN medicamento VARCHAR(120) NULL,
        ADD COLUMN presentacion VARCHAR(80) NULL,
        ADD COLUMN dosis VARCHAR(80) NULL,
        ADD COLUMN via VARCHAR(40) NULL,
        ADD COLUMN version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
        ADD COLUMN updated_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6))
    `);
    await q.query('UPDATE recomendaciones SET fecha_inicio = DATE(created_at) WHERE fecha_inicio IS NULL');
    await q.query(`
      CREATE TABLE recomendaciones_versiones (
        id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
        recomendacion_id INT UNSIGNED NOT NULL,
        version         SMALLINT UNSIGNED NOT NULL,
        contenido       LONGTEXT NOT NULL,
        cambiado_por    INT UNSIGNED NOT NULL,
        motivo          VARCHAR(200) NULL,
        created_at      DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_rv_reco (recomendacion_id, version),
        CONSTRAINT fk_rv_reco FOREIGN KEY (recomendacion_id) REFERENCES recomendaciones (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE pautas (
        id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
        recomendacion_id INT UNSIGNED NOT NULL,
        version          SMALLINT UNSIGNED NOT NULL,
        modo             ENUM('CADA_N_HORAS','HORAS_FIJAS','SEGUN_NECESIDAD') NOT NULL,
        intervalo_horas  SMALLINT UNSIGNED NULL,
        horas_locales    VARCHAR(100) NULL,
        medicamento      VARCHAR(120) NULL,
        presentacion     VARCHAR(80) NULL,
        dosis            VARCHAR(80) NULL,
        via              VARCHAR(40) NULL,
        inicio_local     CHAR(16) NOT NULL,
        duracion_dias    SMALLINT UNSIGNED NOT NULL,
        dias_semana      VARCHAR(20) NULL,
        vigente          TINYINT(1) NOT NULL DEFAULT 1,
        creada_por       INT UNSIGNED NOT NULL,
        motivo_cambio    VARCHAR(200) NULL,
        created_at       DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_pa_reco (recomendacion_id, vigente),
        CONSTRAINT fk_pa_reco FOREIGN KEY (recomendacion_id) REFERENCES recomendaciones (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE eventos_tratamiento (
        id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        pauta_id         INT UNSIGNED NOT NULL,
        recomendacion_id INT UNSIGNED NOT NULL,
        paciente_id      INT UNSIGNED NOT NULL,
        programado_en    DATETIME(6) NOT NULL,
        estado           ENUM('PENDIENTE','REALIZADA','OMITIDA','ANULADA') NOT NULL DEFAULT 'PENDIENTE',
        registrado_en    DATETIME(6) NULL,
        hora_real        DATETIME(6) NULL,
        nota             VARCHAR(200) NULL,
        motivo_anulacion VARCHAR(200) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_evento_pauta_hora (pauta_id, programado_en),
        KEY idx_ev_paciente (paciente_id, programado_en),
        KEY idx_ev_reco (recomendacion_id),
        CONSTRAINT fk_ev_pauta FOREIGN KEY (pauta_id) REFERENCES pautas (id) ON DELETE RESTRICT,
        CONSTRAINT fk_ev_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['eventos_tratamiento', 'pautas', 'recomendaciones_versiones']) await q.query(`DROP TABLE ${t}`);
    await q.query(`
      ALTER TABLE recomendaciones
        DROP COLUMN atencion_id, DROP COLUMN fecha_inicio, DROP COLUMN fecha_fin, DROP COLUMN estado,
        DROP COLUMN motivo_suspension, DROP COLUMN suspendida_por, DROP COLUMN suspendida_en,
        DROP COLUMN medicamento, DROP COLUMN presentacion, DROP COLUMN dosis, DROP COLUMN via,
        DROP COLUMN version, DROP COLUMN updated_at
    `);
  }
}
