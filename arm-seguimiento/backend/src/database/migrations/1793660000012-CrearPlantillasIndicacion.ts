import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLA = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Crea las plantillas de indicaciones (por ejemplo «Paracetamol cada 8 horas por 6 días» o «Reposo en casa») y
 * marca qué médicos son director médico. Las plantillas las administran el administrador y el director médico;
 * el médico solo las elige y puede ajustar todos los campos antes de guardar.
 */
export class CrearPlantillasIndicacion1793660000012 implements MigrationInterface {
  name = 'CrearPlantillasIndicacion1793660000012';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE perfil_profesional ADD COLUMN es_director TINYINT(1) NOT NULL DEFAULT 0`);
    await q.query(`
      CREATE TABLE plantillas_indicacion (
        id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre          VARCHAR(100) NOT NULL,
        tipo            VARCHAR(20) NOT NULL,
        titulo          VARCHAR(150) NOT NULL,
        descripcion     VARCHAR(2000) NOT NULL,
        medicamento     VARCHAR(120) NULL,
        presentacion    VARCHAR(80) NULL,
        dosis           VARCHAR(80) NULL,
        via             VARCHAR(40) NULL,
        modo            VARCHAR(20) NULL,
        intervalo_horas SMALLINT UNSIGNED NULL,
        duracion_dias   SMALLINT UNSIGNED NULL,
        activa          TINYINT(1) NOT NULL DEFAULT 1,
        creada_por      INT UNSIGNED NOT NULL,
        created_at      DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        updated_at      DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        UNIQUE KEY uq_pl_nombre (nombre),
        CONSTRAINT fk_pl_creada FOREIGN KEY (creada_por) REFERENCES usuarios (id)
      ) ${TABLA}
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE plantillas_indicacion`);
    await q.query(`ALTER TABLE perfil_profesional DROP COLUMN es_director`);
  }
}
