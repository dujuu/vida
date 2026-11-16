/**
 * Carga los datos de demostración: los cuatro roles, una persona con dos roles, agenda de los médicos, citas,
 * indicaciones (algunas con pauta y tomas ya marcadas), una ficha de ejemplo y casos para el dashboard de continuidad.
 *
 * Es repetible: busca cada registro antes de crearlo, así que ejecutarlo varias veces no duplica nada.
 * Con `--reset` borra primero los datos transaccionales (citas, indicaciones, tomas, ficha, contactos y avisos) y los
 * vuelve a crear. La auditoría nunca se borra.
 *
 * **Se bloquea con `MODO=piloto`**: las cuentas de demostración tienen la contraseña publicada en el repositorio y no
 * deben existir en un servidor al que acceden otras personas. Para crear el primer administrador real use
 * `npm run admin:crear`.
 *
 * Uso: `npm run seed` o `npm run seed:reset`.
 */
import bcrypt from 'bcryptjs';
import { generarEventos } from '../calendario/generador.js';
import { diaSemanaDe, hoyLocal, localAUtc, sumarDias } from '../common/fechas.util.js';
import { calcularDv, formatearRut, normalizarRut } from '../common/rut.util.js';
import { ModoPauta } from '../recomendaciones/modo-pauta.enum.js';
import dataSource from './data-source.js';

/** Contraseña única para todos los usuarios de demostración. */
const PASSWORD_DEMO = 'Vida2026';

type Rol = 'PACIENTE' | 'MEDICO' | 'RECEPCIONISTA' | 'ADMINISTRADOR';

/** RUT ficticio con dígito verificador válido a partir de su cuerpo. */
const rutDe = (cuerpo: number) => `${cuerpo}-${calcularDv(String(cuerpo))}`;

/** Personas de demostración. Todos los nombres y RUT son ficticios. */
const PERSONAS: Array<{ rut: string; titulo?: string; nombres: string; ap: string; am?: string; roles: Rol[]; especialidad?: string; correo?: string; telefono?: string }> = [
  { rut: rutDe(11222333), nombres: 'Camila', ap: 'Rojas', am: 'Vega', roles: ['ADMINISTRADOR'], correo: 'camila.rojas@ejemplo.cl' },
  { rut: rutDe(12333444), nombres: 'Daniela', ap: 'Pizarro', am: 'Soto', roles: ['RECEPCIONISTA', 'PACIENTE'], telefono: '+56 9 5555 0001' },
  { rut: '12.345.678-5', titulo: 'Dr.', nombres: 'Rodrigo', ap: 'Salas', roles: ['MEDICO'], especialidad: 'Medicina General' },
  { rut: '14.567.890-0', titulo: 'Dra.', nombres: 'Paula', ap: 'Contreras', roles: ['MEDICO'], especialidad: 'Kinesiología' },
  { rut: '16.789.012-1', nombres: 'Ana', ap: 'Muñoz', roles: ['PACIENTE'], telefono: '+56 9 5555 0101', correo: 'ana.munoz@ejemplo.cl' },
  { rut: '18.234.567-9', nombres: 'Carlos', ap: 'Pérez', roles: ['PACIENTE'], telefono: '+56 9 5555 0102' },
  { rut: '19.345.678-2', nombres: 'Sofía', ap: 'Araya', roles: ['PACIENTE'], telefono: '+56 9 5555 0103' },
];

/** Relaciones `[rut médico, rut paciente]`. Carlos Pérez tiene a los dos médicos. */
const ASIGNACIONES: Array<[string, string]> = [
  ['12.345.678-5', '16.789.012-1'],
  ['12.345.678-5', '18.234.567-9'],
  ['14.567.890-0', '18.234.567-9'],
  ['14.567.890-0', '19.345.678-2'],
];

/** Fecha de hace `dias` días y `horas` horas. */
const hace = (dias: number, horas = 0) => new Date(Date.now() - dias * 86_400_000 - horas * 3_600_000);

/** Indicaciones generales: [médico, paciente, tipo, título, texto, hace cuántos días, leída (horas después)]. */
const RECOMENDACIONES: Array<[string, string, string, string, string, number, number | null]> = [
  ['12.345.678-5', '16.789.012-1', 'HABITO_EVITAR', 'Evitar el alcohol durante el tratamiento', 'No consuma alcohol mientras tome el antibiótico (7 días). Si tiene dudas sobre otros medicamentos, consulte antes de tomarlos.', 2, null],
  ['12.345.678-5', '18.234.567-9', 'MEDICAMENTO', 'Ibuprofeno con comida', 'Tome 1 comprimido de 400 mg cada 8 horas solo si hay dolor, siempre con alimentos. No lo use más de 5 días seguidos.', 7, 5],
  ['12.345.678-5', '18.234.567-9', 'RUTINA', 'Caminata diaria', 'Camine 30 minutos al día a ritmo suave, de preferencia por la mañana. Si se siente bien, suba 5 minutos cada semana.', 4, null],
  ['14.567.890-0', '18.234.567-9', 'HABITO_EVITAR', 'Evitar cargar peso', 'No levante objetos de más de 5 kg durante las próximas dos semanas.', 1, null],
  ['14.567.890-0', '19.345.678-2', 'RUTINA', 'Estiramientos de espalda', 'Estire la espalda baja 10 minutos al despertar y antes de dormir, sin rebotes ni movimientos bruscos.', 8, null],
  ['14.567.890-0', '19.345.678-2', 'OTRO', 'Control en dos semanas', 'Agende una hora de control para evaluar cómo va su recuperación.', 5, 30],
];

const FERIADOS: Array<[string, string]> = [
  ['2026-12-08', 'Inmaculada Concepción'],
  ['2026-12-25', 'Navidad'],
  ['2027-01-01', 'Año Nuevo'],
];

const TABLAS_TRANSACCIONALES = [
  'eventos_tratamiento', 'pautas', 'recomendaciones_versiones', 'recomendaciones', 'citas_historial', 'contactos', 'documentos', 'enmiendas',
  'signos_vitales', 'diagnosticos', 'examenes', 'antecedentes', 'atenciones', 'citas', 'notificaciones',
];

async function main() {
  if ((process.env.MODO ?? '').toLowerCase() === 'piloto' || process.env.NODE_ENV === 'production') {
    throw new Error('El script de datos de demostración está bloqueado en modo piloto. Use "npm run admin:crear" para crear el primer administrador.');
  }
  await dataSource.initialize();
  const q = (sql: string, params: unknown[] = []) => dataSource.query(sql, params);
  const passwordHash = await bcrypt.hash(PASSWORD_DEMO, 10);

  if (process.argv.includes('--reset')) {
    for (const t of TABLAS_TRANSACCIONALES) await q(`DELETE FROM ${t}`);
  }

  // Personas, roles y perfiles
  const ids = new Map<string, number>();
  for (const p of PERSONAS) {
    const rut = normalizarRut(p.rut);
    if (!rut) throw new Error(`RUT de seed inválido: ${p.rut}`);
    let [fila] = await q('SELECT id FROM usuarios WHERE rut = ?', [rut]);
    if (!fila) {
      await q(
        `INSERT INTO usuarios (rut, titulo, nombres, apellido_paterno, apellido_materno, correo, telefono, password_hash, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [rut, p.titulo ?? null, p.nombres, p.ap, p.am ?? null, p.correo ?? null, p.telefono ?? null, passwordHash],
      );
      [fila] = await q('SELECT id FROM usuarios WHERE rut = ?', [rut]);
    }
    ids.set(p.rut, fila.id);
    for (const rol of p.roles) await q('INSERT IGNORE INTO usuario_rol (usuario_id, rol) VALUES (?, ?)', [fila.id, rol]);
    if (p.roles.includes('MEDICO')) {
      const [esp] = await q('SELECT id FROM especialidades WHERE nombre = ?', [p.especialidad]);
      await q(
        `INSERT IGNORE INTO perfil_profesional (usuario_id, especialidad_id, registro_profesional, duracion_cita_min, presentacion) VALUES (?, ?, ?, 30, ?)`,
        [fila.id, esp.id, `RPI-${fila.id}0042`, `${p.titulo} ${p.nombres} ${p.ap}, ${p.especialidad}.`],
      );
    }
    if (p.roles.includes('PACIENTE')) {
      await q(`INSERT IGNORE INTO perfil_paciente (usuario_id, fecha_nacimiento, sexo, medio_contacto) VALUES (?, ?, ?, 'WHATSAPP')`, [fila.id, '1985-04-12', 'F']);
      const [{ n }] = await q('SELECT COUNT(*) AS n FROM consentimientos WHERE paciente_id = ?', [fila.id]);
      if (Number(n) === 0) await q(`INSERT INTO consentimientos (paciente_id, version, medio) VALUES (?, 1, 'APP')`, [fila.id]);
    }
  }
  const id = (rut: string) => ids.get(rut)!;
  const SALAS = '12.345.678-5';
  const CONTRERAS = '14.567.890-0';
  const ANA = '16.789.012-1';
  const CARLOS = '18.234.567-9';
  const SOFIA = '19.345.678-2';
  const DANIELA = PERSONAS[1].rut;
  const ADMIN = PERSONAS[0].rut;
  void ADMIN;

  for (const [m, p] of ASIGNACIONES) await q(`INSERT IGNORE INTO doctor_paciente (doctor_id, paciente_id, origen) VALUES (?, ?, 'INICIAL')`, [id(m), id(p)]);

  // Horarios y feriados
  const horarios: Array<[string, Array<[string, string]>]> = [
    [SALAS, [['09:00', '13:00'], ['14:30', '17:30']]],
    [CONTRERAS, [['08:30', '12:30']]],
  ];
  for (const [rut, bloques] of horarios) {
    const [{ n }] = await q('SELECT COUNT(*) AS n FROM bloques_horario WHERE medico_id = ?', [id(rut)]);
    if (Number(n) > 0) continue;
    for (let dia = 1; dia <= 5; dia++) for (const [ini, fin] of bloques) await q('INSERT INTO bloques_horario (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde) VALUES (?, ?, ?, ?, ?)', [id(rut), dia, ini, fin, '2026-01-01']);
  }
  for (const [f, n] of FERIADOS) await q('INSERT IGNORE INTO feriados (fecha, nombre) VALUES (?, ?)', [f, n]);

  const esFeriado = (f: string) => FERIADOS.some(([x]) => x === f);
  const habil = (f: string) => diaSemanaDe(f) <= 5 && !esFeriado(f);
  const diaHabil = (desde: string, paso: 1 | -1) => {
    let f = sumarDias(desde, paso);
    while (!habil(f)) f = sumarDias(f, paso);
    return f;
  };
  const hoy = hoyLocal();

  // Indicaciones generales
  for (const [medico, paciente, tipo, titulo, texto, dias, leidaTrasHoras] of RECOMENDACIONES) {
    const [ya] = await q('SELECT 1 AS ok FROM recomendaciones WHERE doctor_id = ? AND paciente_id = ? AND titulo = ?', [id(medico), id(paciente), titulo]);
    if (ya) continue;
    const creada = hace(dias);
    await q(
      `INSERT INTO recomendaciones (doctor_id, paciente_id, tipo, titulo, descripcion, created_at, leida_at, fecha_inicio, estado, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVA', 1)`,
      [id(medico), id(paciente), tipo, titulo, texto, creada, leidaTrasHoras === null ? null : new Date(creada.getTime() + leidaTrasHoras * 3_600_000), creada.toISOString().slice(0, 10)],
    );
  }

  // Indicaciones con pauta y tomas (algunas ya marcadas)
  const conPauta: Array<{ medico: string; paciente: string; tipo: string; titulo: string; texto: string; med: [string, string, string, string] | null; modo: ModoPauta; intervalo: number | null; horas: string[] | null; inicio: string; dias: number; realizadas: number; omitidas: number }> = [
    { medico: SALAS, paciente: ANA, tipo: 'MEDICAMENTO', titulo: 'Paracetamol 500 mg cada 8 horas por 8 días', texto: 'Tome 1 comprimido de 500 mg cada 8 horas, después de las comidas. Si la fiebre sigue pasadas 48 horas, pida una hora de control.', med: ['Paracetamol', 'Comprimido 500 mg', '1 comprimido', 'Oral'], modo: ModoPauta.CADA_N_HORAS, intervalo: 8, horas: null, inicio: `${sumarDias(hoy, -2)} 08:00`, dias: 8, realizadas: 4, omitidas: 1 },
    { medico: CONTRERAS, paciente: CARLOS, tipo: 'RUTINA', titulo: 'Ejercicios de movilidad de hombro', texto: 'Haga 3 series de 10 repeticiones, dos veces al día. Deténgase si siente un dolor punzante.', med: null, modo: ModoPauta.HORAS_FIJAS, intervalo: null, horas: ['09:00', '19:00'], inicio: `${sumarDias(hoy, -3)} 09:00`, dias: 14, realizadas: 2, omitidas: 0 },
  ];
  for (const t of conPauta) {
    const [ya] = await q('SELECT 1 AS ok FROM recomendaciones WHERE doctor_id = ? AND paciente_id = ? AND titulo = ?', [id(t.medico), id(t.paciente), t.titulo]);
    if (ya) continue;
    const fechaInicio = t.inicio.slice(0, 10);
    await q(
      `INSERT INTO recomendaciones (doctor_id, paciente_id, tipo, titulo, descripcion, created_at, leida_at, fecha_inicio, fecha_fin, estado, medicamento, presentacion, dosis, via, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVA', ?, ?, ?, ?, 1)`,
      [id(t.medico), id(t.paciente), t.tipo, t.titulo, t.texto, hace(3), hace(3, -1), fechaInicio, sumarDias(fechaInicio, t.dias - 1), ...(t.med ?? [null, null, null, null])],
    );
    const [{ rid }] = await q('SELECT LAST_INSERT_ID() AS rid');
    await q(
      `INSERT INTO pautas (recomendacion_id, version, modo, intervalo_horas, horas_locales, medicamento, presentacion, dosis, via, inicio_local, duracion_dias, vigente, creada_por) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [rid, t.modo, t.intervalo, t.horas ? t.horas.join(',') : null, ...(t.med ?? [null, null, null, null]), t.inicio, t.dias, id(t.medico)],
    );
    const [{ pid }] = await q('SELECT LAST_INSERT_ID() AS pid');
    const tomas = generarEventos({ modo: t.modo, intervaloHoras: t.intervalo, horasLocales: t.horas, inicioLocal: t.inicio, duracionDias: t.dias }, { hasta: new Date(Date.now() + 14 * 86_400_000) });
    let marcadas = 0;
    for (const toma of tomas) {
      const pasada = toma.getTime() < Date.now();
      let estado = 'PENDIENTE';
      let registrado: Date | null = null;
      if (pasada && marcadas < t.realizadas) (estado = 'REALIZADA', registrado = new Date(toma.getTime() + 10 * 60_000), marcadas++);
      else if (pasada && marcadas < t.realizadas + t.omitidas) (estado = 'OMITIDA', registrado = new Date(toma.getTime() + 30 * 60_000), marcadas++);
      await q('INSERT IGNORE INTO eventos_tratamiento (pauta_id, recomendacion_id, paciente_id, programado_en, estado, registrado_en, hora_real) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        pid, rid, id(t.paciente), toma, estado, registrado, estado === 'REALIZADA' ? registrado : null,
      ]);
    }
  }

  // Citas (alineadas a la grilla de cada médico): pasadas atendidas, una inasistencia y varias futuras
  const cita = async (medico: string, paciente: string, fecha: string, hora: string, estado: string, canal = 'MESON') => {
    const inicio = localAUtc(fecha, hora);
    const [ya] = await q('SELECT id FROM citas WHERE medico_id = ? AND paciente_id = ? AND inicio = ?', [id(medico), id(paciente), inicio]);
    if (ya) return ya.id as number;
    const fin = new Date(inicio.getTime() + 30 * 60_000);
    const activa = estado !== 'CANCELADA';
    await q(
      `INSERT INTO citas (medico_id, paciente_id, inicio, fin, estado, tipo, canal, creada_por, atendida_en, slot_activo, created_at) VALUES (?, ?, ?, ?, ?, 'CONTROL', ?, ?, ?, ?, ?)`,
      [id(medico), id(paciente), inicio, fin, estado, canal, id(DANIELA), estado === 'ATENDIDA' ? inicio : null, activa ? inicio : null, new Date(inicio.getTime() - 5 * 86_400_000)],
    );
    const [{ cid }] = await q('SELECT LAST_INSERT_ID() AS cid');
    await q('INSERT INTO citas_historial (cita_id, estado_anterior, estado_nuevo, usuario_id) VALUES (?, NULL, ?, ?)', [cid, estado, id(DANIELA)]);
    return cid as number;
  };
  const pasada = diaHabil(hoy, -1);
  const antesDeAyer = diaHabil(pasada, -1);
  const hace10 = diaHabil(diaHabil(diaHabil(antesDeAyer, -1), -1), -1);
  const citaAna = await cita(SALAS, ANA, pasada, '10:00', 'ATENDIDA', 'APP');
  await cita(SALAS, CARLOS, hace10, '10:30', 'NO_ASISTIO');
  await cita(CONTRERAS, CARLOS, antesDeAyer, '09:30', 'ATENDIDA');
  const manana = diaHabil(hoy, 1);
  await cita(SALAS, ANA, diaHabil(manana, 1), '10:30', 'RESERVADA', 'APP');
  await cita(CONTRERAS, CARLOS, manana, '09:30', 'RESERVADA');
  await cita(SALAS, ANA, diaHabil(diaHabil(manana, 1), 1), '11:00', 'RESERVADA');

  // Ficha de ejemplo de Ana
  const [{ nAnt }] = await q('SELECT COUNT(*) AS nAnt FROM antecedentes WHERE paciente_id = ?', [id(ANA)]);
  if (Number(nAnt) === 0) {
    await q(`INSERT INTO antecedentes (paciente_id, tipo, descripcion, detalle, severidad, reaccion, registrado_por) VALUES (?, 'ALERGIA', 'Penicilina', NULL, 'GRAVE', 'Urticaria y dificultad para respirar', ?)`, [id(ANA), id(SALAS)]);
    await q(`INSERT INTO antecedentes (paciente_id, tipo, descripcion, desde, registrado_por) VALUES (?, 'MORBIDO', 'Hipertensión arterial', '2021-03-01', ?)`, [id(ANA), id(SALAS)]);
    await q(`INSERT INTO antecedentes (paciente_id, tipo, descripcion, registrado_por) VALUES (?, 'HABITO', 'No fuma', ?)`, [id(ANA), id(SALAS)]);
    const inicio = localAUtc(pasada, '10:00');
    await q(
      `INSERT INTO atenciones (paciente_id, medico_id, cita_id, fecha, motivo, anamnesis, examen_fisico, plan, observaciones, estado, cerrada_en)
       VALUES (?, ?, ?, ?, 'Control de hipertensión arterial', 'Refiere cefalea ocasional en las tardes. Buena adherencia al tratamiento.', 'Abdomen blando, sin edema. Ruidos cardíacos rítmicos.', 'Continuar con el tratamiento actual y control de presión en casa. Control en 3 meses.', 'Paciente informada de signos de alarma.', 'CERRADA', ?)`,
      [id(ANA), id(SALAS), citaAna, inicio, new Date(inicio.getTime() + 25 * 60_000)],
    );
    const [{ aid }] = await q('SELECT LAST_INSERT_ID() AS aid');
    await q('INSERT INTO signos_vitales (atencion_id, paciente_id, pa_sistolica, pa_diastolica, frecuencia_cardiaca, temperatura, saturacion, peso_kg, talla_cm) VALUES (?, ?, 128, 82, 72, 36.6, 98, 68.5, 162)', [aid, id(ANA)]);
    await q(`INSERT INTO diagnosticos (paciente_id, atencion_id, descripcion, codigo_cie10, principal, registrado_por) VALUES (?, ?, 'Hipertensión arterial esencial', 'I10', 1, ?)`, [id(ANA), aid, id(SALAS)]);
    await q(`INSERT INTO examenes (paciente_id, atencion_id, nombre, tipo, estado, fecha_resultado, resultado, solicitado_por) VALUES (?, ?, 'Perfil lipídico', 'LABORATORIO', 'CON_RESULTADO', ?, 'Colesterol total 189 mg/dL. Dentro de los valores de referencia del laboratorio.', ?)`, [id(ANA), aid, pasada, id(SALAS)]);
  }

  // Un contacto de ejemplo
  const [{ nCon }] = await q('SELECT COUNT(*) AS nCon FROM contactos WHERE paciente_id = ?', [id(CARLOS)]);
  if (Number(nCon) === 0) {
    await q(
      `INSERT INTO contactos (paciente_id, medio, sentido, motivo, resultado, detalle, responsable_id, proximo_contacto, cerrado) VALUES (?, 'LLAMADA', 'SALIENTE', 'SEGUIMIENTO', 'SIN_RESPUESTA', 'No contestó. Se intentará nuevamente.', ?, ?, 0)`,
      [id(CARLOS), id(DANIELA), hoy],
    );
  }

  console.log(`\nUsuarios de demostración (contraseña: ${PASSWORD_DEMO})`);
  for (const p of PERSONAS) console.log(`  ${p.roles.join(' + ').padEnd(24)} ${formatearRut(normalizarRut(p.rut)!).padEnd(13)} ${[p.titulo, p.nombres, p.ap].filter(Boolean).join(' ')}`);
  await dataSource.destroy();
}

main().catch(async (err) => {
  console.error(err);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
