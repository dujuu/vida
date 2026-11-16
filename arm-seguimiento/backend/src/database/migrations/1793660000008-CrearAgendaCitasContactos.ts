import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLA = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Crea la agenda (bloques de horario y bloqueos), las citas con su historial de estados y los contactos.
 *
 * La garantía contra la doble reserva está aquí: `slot_activo` vale la hora de inicio mientras la cita está
 * activa y queda en NULL al cancelarse. Las dos restricciones únicas impiden que un médico o un paciente tengan
 * dos citas activas a la misma hora; los NULL no chocan entre sí.
 */
export class CrearAgendaCitasContactos1793660000008 implements MigrationInterface {
  name = 'CrearAgendaCitasContactos1793660000008';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE bloques_horario (
        id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
        medico_id     INT UNSIGNED NOT NULL,
        dia_semana    TINYINT UNSIGNED NOT NULL,
        hora_inicio   CHAR(5) NOT NULL,
        hora_fin      CHAR(5) NOT NULL,
        vigente_desde DATE NOT NULL,
        vigente_hasta DATE NULL,
        created_at    DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_bh_medico (medico_id, dia_semana),
        CONSTRAINT fk_bh_medico FOREIGN KEY (medico_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE bloqueos (
        id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
        medico_id  INT UNSIGNED NOT NULL,
        desde      DATETIME(6) NOT NULL,
        hasta      DATETIME(6) NOT NULL,
        motivo     ENUM('VACACIONES','PERMISO','OTRO') NOT NULL DEFAULT 'OTRO',
        detalle    VARCHAR(200) NULL,
        creado_por INT UNSIGNED NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_bq_medico (medico_id, desde),
        CONSTRAINT fk_bq_medico FOREIGN KEY (medico_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE citas (
        id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
        medico_id          INT UNSIGNED NOT NULL,
        paciente_id        INT UNSIGNED NOT NULL,
        inicio             DATETIME(6) NOT NULL,
        fin                DATETIME(6) NOT NULL,
        estado             ENUM('RESERVADA','EN_ESPERA','EN_ATENCION','ATENDIDA','CANCELADA','NO_ASISTIO') NOT NULL DEFAULT 'RESERVADA',
        tipo               ENUM('PRIMERA_VEZ','CONTROL','EXAMEN','OTRO') NOT NULL DEFAULT 'CONTROL',
        canal              ENUM('APP','MESON','TELEFONO') NOT NULL,
        creada_por         INT UNSIGNED NOT NULL,
        llegada_en         DATETIME(6) NULL,
        atendida_en        DATETIME(6) NULL,
        cancelada_en       DATETIME(6) NULL,
        cancelada_por      INT UNSIGNED NULL,
        motivo_cancelacion VARCHAR(200) NULL,
        reprogramada_desde INT UNSIGNED NULL,
        nota               VARCHAR(200) NULL,
        slot_activo        DATETIME(6) NULL,
        created_at         DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        UNIQUE KEY uq_cita_medico_slot (medico_id, slot_activo),
        UNIQUE KEY uq_cita_paciente_slot (paciente_id, slot_activo),
        KEY idx_cita_medico_inicio (medico_id, inicio),
        KEY idx_cita_paciente_inicio (paciente_id, inicio),
        KEY idx_cita_estado (estado, inicio),
        CONSTRAINT fk_cita_medico FOREIGN KEY (medico_id) REFERENCES usuarios (id) ON DELETE RESTRICT,
        CONSTRAINT fk_cita_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE citas_historial (
        id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
        cita_id         INT UNSIGNED NOT NULL,
        estado_anterior VARCHAR(20) NULL,
        estado_nuevo    VARCHAR(20) NOT NULL,
        usuario_id      INT UNSIGNED NOT NULL,
        created_at      DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_ch_cita (cita_id),
        CONSTRAINT fk_ch_cita FOREIGN KEY (cita_id) REFERENCES citas (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
    await q.query(`
      CREATE TABLE contactos (
        id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
        paciente_id      INT UNSIGNED NOT NULL,
        medio            ENUM('LLAMADA','WHATSAPP','CORREO','PRESENCIAL') NOT NULL,
        sentido          ENUM('ENTRANTE','SALIENTE') NOT NULL,
        motivo           ENUM('RESERVA','REPROGRAMACION','CANCELACION','RECORDATORIO','SEGUIMIENTO','CONSULTA','RECLAMO','OTRO') NOT NULL,
        resultado        ENUM('RESUELTO','SIN_RESPUESTA','REQUIERE_SEGUIMIENTO','DERIVADO') NOT NULL,
        detalle          VARCHAR(1000) NULL,
        simulado         TINYINT(1) NOT NULL DEFAULT 0,
        responsable_id   INT UNSIGNED NOT NULL,
        cita_id          INT UNSIGNED NULL,
        proximo_contacto DATE NULL,
        cerrado          TINYINT(1) NOT NULL DEFAULT 0,
        solicitado_por   INT UNSIGNED NULL,
        created_at       DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
        PRIMARY KEY (id),
        KEY idx_con_paciente (paciente_id, created_at),
        KEY idx_con_pendiente (cerrado, proximo_contacto),
        CONSTRAINT fk_con_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios (id) ON DELETE RESTRICT
      ) ${TABLA}
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['contactos', 'citas_historial', 'citas', 'bloqueos', 'bloques_horario']) await q.query(`DROP TABLE ${t}`);
  }
}
