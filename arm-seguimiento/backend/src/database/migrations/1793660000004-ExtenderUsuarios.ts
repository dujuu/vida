import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prepara `usuarios` para varios roles y datos de contacto.
 *
 * Agrega nombres, apellidos, correo, teléfono y último acceso; hace opcional la contraseña (una cuenta sin
 * contraseña está sin activar) y crea `usuario_rol`, donde pasa a vivir el rol. Las columnas antiguas `nombre`,
 * `rol` y `especialidad` se quitan en la migración siguiente, cuando sus datos ya tienen destino.
 */
export class ExtenderUsuarios1793660000004 implements MigrationInterface {
  name = 'ExtenderUsuarios1793660000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE usuarios
        ADD COLUMN titulo VARCHAR(10) NULL AFTER rut,
        ADD COLUMN nombres VARCHAR(80) NOT NULL DEFAULT '' AFTER titulo,
        ADD COLUMN apellido_paterno VARCHAR(60) NOT NULL DEFAULT '' AFTER nombres,
        ADD COLUMN apellido_materno VARCHAR(60) NULL AFTER apellido_paterno,
        ADD COLUMN correo VARCHAR(120) NULL,
        ADD COLUMN telefono VARCHAR(20) NULL,
        ADD COLUMN debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0,
        ADD COLUMN ultimo_acceso DATETIME(6) NULL,
        MODIFY password_hash VARCHAR(100) NULL
    `);
    // El nombre antiguo ("Dr. Rodrigo Salas") se reparte en título, nombres y apellido paterno.
    await q.query(`UPDATE usuarios SET titulo = CASE WHEN nombre LIKE 'Dr. %' THEN 'Dr.' WHEN nombre LIKE 'Dra. %' THEN 'Dra.' ELSE NULL END`);
    await q.query(`UPDATE usuarios SET nombre = TRIM(SUBSTRING(nombre, CHAR_LENGTH(titulo) + 1)) WHERE titulo IS NOT NULL`);
    await q.query(`
      UPDATE usuarios SET
        apellido_paterno = SUBSTRING_INDEX(nombre, ' ', -1),
        nombres = TRIM(SUBSTRING(nombre, 1, CHAR_LENGTH(nombre) - CHAR_LENGTH(SUBSTRING_INDEX(nombre, ' ', -1))))
    `);
    await q.query(`UPDATE usuarios SET nombres = apellido_paterno, apellido_paterno = '' WHERE nombres = ''`);
    await q.query(`
      CREATE TABLE usuario_rol (
        usuario_id   INT UNSIGNED NOT NULL,
        rol          ENUM('PACIENTE','MEDICO','RECEPCIONISTA','ADMINISTRADOR') NOT NULL,
        asignado_por INT UNSIGNED NULL,
        created_at   DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (usuario_id, rol),
        CONSTRAINT fk_ur_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await q.query(`INSERT INTO usuario_rol (usuario_id, rol) SELECT id, IF(rol = 'DOCTOR', 'MEDICO', 'PACIENTE') FROM usuarios`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE usuario_rol');
    await q.query(`
      ALTER TABLE usuarios
        DROP COLUMN titulo, DROP COLUMN nombres, DROP COLUMN apellido_paterno, DROP COLUMN apellido_materno,
        DROP COLUMN correo, DROP COLUMN telefono, DROP COLUMN debe_cambiar_password, DROP COLUMN ultimo_acceso
    `);
    await q.query(`UPDATE usuarios SET password_hash = '' WHERE password_hash IS NULL`);
    await q.query('ALTER TABLE usuarios MODIFY password_hash VARCHAR(100) NOT NULL');
  }
}
