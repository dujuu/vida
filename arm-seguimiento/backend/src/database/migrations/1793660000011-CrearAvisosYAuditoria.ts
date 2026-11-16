import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLA = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Crea las notificaciones, las preferencias de aviso y la auditoría.
 *
 * La auditoría es solo de inserción: dos disparadores impiden modificar o borrar filas, de modo que ni siquiera
 * un error en el código de la aplicación puede alterar el registro.
 */
export class CrearAvisosYAuditoria1793660000011 implements MigrationInterface {
  name = 'CrearAvisosYAuditoria1793660000011';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE notificaciones (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        usuario_id INT UNSIGNED NOT NULL,
        tipo       VARCHAR(40) NOT NULL,
        titulo     VARCHAR(120) NOT NULL,
        texto      VARCHAR(300) NOT NULL,
        enlace     VARCHAR(120) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        leida_en   DATETIME(6) NULL,
        PRIMARY KEY (id),
        KEY idx_no_usuario (usuario_id, leida_en, created_at),
        CONSTRAINT fk_no_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE preferencias_aviso (
        usuario_id         INT UNSIGNED NOT NULL,
        avisos_tomas       TINYINT(1) NOT NULL DEFAULT 1,
        avisos_citas       TINYINT(1) NOT NULL DEFAULT 1,
        silencio_desde     CHAR(5) NULL,
        silencio_hasta     CHAR(5) NULL,
        PRIMARY KEY (usuario_id),
        CONSTRAINT fk_pav_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE auditoria (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        fecha       DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        usuario_id  INT UNSIGNED NULL,
        rol         VARCHAR(20) NULL,
        accion      VARCHAR(40) NOT NULL,
        recurso     VARCHAR(40) NULL,
        recurso_id  VARCHAR(40) NULL,
        paciente_id INT UNSIGNED NULL,
        resultado   ENUM('PERMITIDO','DENEGADO','ERROR') NOT NULL DEFAULT 'PERMITIDO',
        ip          VARCHAR(45) NULL,
        agente      VARCHAR(200) NULL,
        detalle     VARCHAR(300) NULL,
        PRIMARY KEY (id),
        KEY idx_au_paciente (paciente_id, fecha),
        KEY idx_au_usuario (usuario_id, fecha),
        KEY idx_au_accion (accion, fecha)
      ) ${TABLA}
    `);
    await q.query(
      `CREATE TRIGGER auditoria_sin_update BEFORE UPDATE ON auditoria FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría no se puede modificar'`,
    );
    await q.query(
      `CREATE TRIGGER auditoria_sin_delete BEFORE DELETE ON auditoria FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría no se puede borrar'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER auditoria_sin_update');
    await q.query('DROP TRIGGER auditoria_sin_delete');
    for (const t of ['auditoria', 'preferencias_aviso', 'notificaciones']) await q.query(`DROP TABLE ${t}`);
  }
}
