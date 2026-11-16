import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Agrega a `doctor_paciente` el origen del vínculo, su vigencia y el motivo de cierre. */
export class AmpliarRelacionMedicoPaciente1793660000007 implements MigrationInterface {
  name = 'AmpliarRelacionMedicoPaciente1793660000007';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE doctor_paciente
        ADD COLUMN origen ENUM('CITA','MANUAL','INICIAL') NOT NULL DEFAULT 'INICIAL',
        ADD COLUMN creada_por INT UNSIGNED NULL,
        ADD COLUMN vigente TINYINT(1) NOT NULL DEFAULT 1,
        ADD COLUMN cerrada_en DATETIME(6) NULL,
        ADD COLUMN motivo_cierre VARCHAR(200) NULL
    `);
    // Una relación con historia clínica no debe desaparecer si se borra un usuario.
    await q.query('ALTER TABLE doctor_paciente DROP FOREIGN KEY fk_dp_doctor, DROP FOREIGN KEY fk_dp_paciente');
    await q.query(`
      ALTER TABLE doctor_paciente
        ADD CONSTRAINT fk_dp_doctor FOREIGN KEY (doctor_id) REFERENCES usuarios (id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_dp_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE doctor_paciente DROP FOREIGN KEY fk_dp_doctor, DROP FOREIGN KEY fk_dp_paciente');
    await q.query(`
      ALTER TABLE doctor_paciente
        ADD CONSTRAINT fk_dp_doctor FOREIGN KEY (doctor_id) REFERENCES usuarios (id) ON DELETE CASCADE,
        ADD CONSTRAINT fk_dp_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE CASCADE
    `);
    await q.query(
      'ALTER TABLE doctor_paciente DROP COLUMN origen, DROP COLUMN creada_por, DROP COLUMN vigente, DROP COLUMN cerrada_en, DROP COLUMN motivo_cierre',
    );
  }
}
