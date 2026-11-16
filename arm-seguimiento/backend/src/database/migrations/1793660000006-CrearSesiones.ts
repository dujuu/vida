import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLA = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/** Crea las sesiones revocables, los códigos de activación o recuperación y el registro de intentos de login. */
export class CrearSesiones1793660000006 implements MigrationInterface {
  name = 'CrearSesiones1793660000006';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE sesiones (
        id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        usuario_id          INT UNSIGNED NOT NULL,
        token_hash          CHAR(64) NOT NULL,
        token_anterior_hash CHAR(64) NULL,
        rol_activo          ENUM('PACIENTE','MEDICO','RECEPCIONISTA','ADMINISTRADOR') NULL,
        agente              VARCHAR(200) NULL,
        ip                  VARCHAR(45) NULL,
        expira_en           DATETIME(6) NOT NULL,
        revocada_en         DATETIME(6) NULL,
        ultimo_uso          DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        created_at          DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_ses_usuario (usuario_id, revocada_en),
        CONSTRAINT fk_ses_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE codigos_acceso (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        usuario_id  INT UNSIGNED NOT NULL,
        tipo        ENUM('ACTIVACION','RECUPERACION') NOT NULL,
        codigo_hash CHAR(64) NOT NULL,
        expira_en   DATETIME(6) NOT NULL,
        usado_en    DATETIME(6) NULL,
        emitido_por INT UNSIGNED NULL,
        created_at  DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_cod_usuario (usuario_id, usado_en),
        CONSTRAINT fk_cod_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE intentos_login (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        rut        VARCHAR(12) NOT NULL,
        ip         VARCHAR(45) NULL,
        exitoso    TINYINT(1) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_il_rut (rut, created_at),
        KEY idx_il_ip (ip, created_at)
      ) ${TABLA}
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['intentos_login', 'codigos_acceso', 'sesiones']) await q.query(`DROP TABLE ${t}`);
  }
}
