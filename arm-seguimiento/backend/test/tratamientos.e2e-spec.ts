// @ts-nocheck
/** Indicaciones, calendario de tomas, versiones, seguimiento y la jornada de atención de un día. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Cliente, crearApp, escenario } from './ayuda.js';

let app, c, esc, ds, f;
beforeAll(async () => {
  app = await crearApp();
  c = new Cliente(app);
  ds = app.get(DataSource);
  f = await import('../dist/common/fechas.util.js');
  esc = await escenario(c);
  // el médico 2 también atiende al paciente
  const horas = await c.horasLibres(esc.recepcion.token, esc.medico2.id);
  await c.post('/citas', esc.recepcion.token, { medicoId: esc.medico2.id, pacienteId: esc.paciente.id, inicio: horas[1].inicio });
});
afterAll(async () => app?.close());

const manana = () => `${f.sumarDias(f.hoyLocal(), 1)} 08:00`;
const pautaOcho = () => ({ modo: 'CADA_N_HORAS', intervaloHoras: 8, inicioLocal: manana(), duracionDias: 8 });
const paracetamol = (extra = {}) => ({
  pacienteId: esc.paciente.id,
  tipo: 'MEDICAMENTO',
  titulo: 'Paracetamol cada 8 horas',
  descripcion: 'Tomar después de las comidas.',
  medicamento: 'Paracetamol',
  presentacion: 'Comprimido 500 mg',
  dosis: '1 comprimido',
  via: 'Oral',
  pauta: pautaOcho(),
  ...extra,
});
const rango = (dias = 60) => `desde=${f.hoyLocal()}&hasta=${f.sumarDias(f.hoyLocal(), dias)}`;

describe('crear indicaciones', () => {
  it('la vista previa muestra las tomas exactas: 8 días cada 8 horas son 24', async () => {
    const r = await c.post('/recomendaciones/vista-previa', esc.medico.token, { pauta: pautaOcho() });
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(24);
    expect(r.body.tomas[0].hora).toBe('08:00');
    expect(r.body.tomas[1].hora).toBe('16:00');
  });

  it('el sistema no inventa dosis: un medicamento sin dosis, vía o nombre se rechaza', async () => {
    for (const quitar of ['dosis', 'via', 'medicamento']) {
      const cuerpo = paracetamol();
      delete cuerpo[quitar];
      const r = await c.post('/recomendaciones', esc.medico.token, cuerpo);
      expect(r.status, quitar).toBe(400);
      expect(r.body.message).toMatch(/dosis|vía|nombre/);
    }
  });

  it('una pauta inválida se rechaza con un mensaje claro', async () => {
    expect((await c.post('/recomendaciones', esc.medico.token, paracetamol({ pauta: { ...pautaOcho(), intervaloHoras: 0 } }))).status).toBe(400);
    expect((await c.post('/recomendaciones', esc.medico.token, paracetamol({ pauta: { ...pautaOcho(), duracionDias: 0 } }))).status).toBe(400);
    expect((await c.post('/recomendaciones', esc.medico.token, paracetamol({ pauta: { modo: 'HORAS_FIJAS', horasLocales: ['25:00'], inicioLocal: manana(), duracionDias: 3 } }))).status).toBe(400);
    expect((await c.post('/recomendaciones', esc.medico.token, paracetamol({ tipo: 'HABITO_EVITAR' }))).status).toBe(400);
  });

  it('crea la indicación con su pauta y genera las 24 tomas en el calendario del paciente', async () => {
    const r = await c.post('/recomendaciones', esc.medico.token, paracetamol());
    expect(r.status).toBe(201);
    expect(r.body.tienePauta).toBe(true);
    expect(r.body.fechaInicio).toBe(f.sumarDias(f.hoyLocal(), 1));
    expect(r.body.fechaFin).toBe(f.sumarDias(f.hoyLocal(), 8));
    esc.reco = r.body;
    const cal = await c.get(`/calendario?${rango()}`, esc.paciente.token);
    expect(cal.status).toBe(200);
    const mias = cal.body.eventos.filter((e) => e.recomendacion.id === r.body.id);
    expect(mias).toHaveLength(24);
    expect(mias[0].recomendacion).toMatchObject({ medicamento: 'Paracetamol', dosis: '1 comprimido', via: 'Oral' });
    expect(mias.every((e) => e.estado === 'PENDIENTE')).toBe(true);
  });

  it('el paciente recibe un aviso sin datos clínicos', async () => {
    const r = await c.get('/notificaciones', esc.paciente.token);
    const aviso = r.body.items.find((n) => n.tipo === 'INDICACION_NUEVA');
    expect(aviso).toBeTruthy();
    expect(JSON.stringify(aviso)).not.toMatch(/Paracetamol|comprimido/i);
  });

  it('dos tratamientos simultáneos conviven en el calendario', async () => {
    const r = await c.post('/recomendaciones', esc.medico.token, {
      pacienteId: esc.paciente.id,
      tipo: 'RUTINA',
      titulo: 'Ejercicios de movilidad',
      descripcion: 'Tres series de diez repeticiones.',
      pauta: { modo: 'HORAS_FIJAS', horasLocales: ['09:00', '19:00'], inicioLocal: `${f.sumarDias(f.hoyLocal(), 1)} 09:00`, duracionDias: 5 },
    });
    expect(r.status).toBe(201);
    const cal = await c.get(`/calendario?${rango()}`, esc.paciente.token);
    expect(new Set(cal.body.eventos.map((e) => e.recomendacion.id)).size).toBeGreaterThanOrEqual(2);
    expect(cal.body.eventos.filter((e) => e.recomendacion.id === r.body.id)).toHaveLength(10);
  });

  it('una indicación general (sin pauta) no genera tomas y aparece como vigente', async () => {
    const r = await c.post('/recomendaciones', esc.medico.token, { pacienteId: esc.paciente.id, tipo: 'HABITO_EVITAR', titulo: 'Evitar el sol', descripcion: 'Evite la exposición directa.', fechaFin: f.sumarDias(f.hoyLocal(), 10) });
    expect(r.status).toBe(201);
    expect(r.body.tienePauta).toBe(false);
    const cal = await c.get(`/calendario?${rango()}`, esc.paciente.token);
    expect(cal.body.eventos.filter((e) => e.recomendacion.id === r.body.id)).toHaveLength(0);
    expect(cal.body.indicacionesVigentes.map((x) => x.id)).toContain(r.body.id);
  });

  it('solo un médico con relación vigente con el paciente puede indicar', async () => {
    const ajeno = await c.crearPaciente(esc.recepcion, 'SinRelacion');
    expect((await c.post('/recomendaciones', esc.medico.token, paracetamol({ pacienteId: ajeno.id }))).status).toBe(404);
  });
});

describe('marcar tomas (autorreporte)', () => {
  let cercana;
  it('el paciente marca una toma realizada, la deshace y la omite', async () => {
    const { fecha, hora } = f.utcALocal(new Date(Date.now() - 10 * 60_000));
    const r = await c.post('/recomendaciones', esc.medico.token, paracetamol({ titulo: 'Tratamiento cercano', pauta: { modo: 'CADA_N_HORAS', intervaloHoras: 1, inicioLocal: `${fecha} ${hora}`, duracionDias: 2 } }));
    expect(r.status).toBe(201);
    cercana = r.body;
    const resumen = await c.get('/notificaciones/resumen', esc.paciente.token);
    expect(resumen.body.tomasPorVencer).toBeGreaterThanOrEqual(1);
    const hoy = await c.get('/calendario/hoy', esc.paciente.token);
    const eventos = hoy.body.eventos.filter((e) => e.recomendacion.id === cercana.id);
    expect(eventos.length).toBeGreaterThan(0);
    const primero = eventos[0];
    expect(primero.puedeMarcar).toBe(true);
    const ok = await c.post(`/eventos/${primero.id}/realizada`, esc.paciente.token, {});
    expect(ok.status).toBe(200);
    expect(ok.body.estado).toBe('REALIZADA');
    expect((await c.post(`/eventos/${primero.id}/deshacer`, esc.paciente.token)).body.estado).toBe('PENDIENTE');
    const om = await c.post(`/eventos/${primero.id}/omitida`, esc.paciente.token, { nota: 'Me olvidé' });
    expect(om.body.estado).toBe('OMITIDA');
    await c.post(`/eventos/${primero.id}/deshacer`, esc.paciente.token);
    await c.post(`/eventos/${primero.id}/realizada`, esc.paciente.token, {});
    cercana.primerEvento = primero.id;
  });

  it('no se puede marcar una toma que aún no corresponde', async () => {
    const cal = await c.get(`/calendario?${rango(3)}`, esc.paciente.token);
    const lejana = cal.body.eventos.find((e) => e.recomendacion.id === esc.reco.id);
    const r = await c.post(`/eventos/${lejana.id}/realizada`, esc.paciente.token, {});
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Aún no es hora/);
  });

  it('no se puede marcar la toma de otra persona', async () => {
    const otro = await c.crearPaciente(esc.recepcion, 'Otro');
    expect((await c.post(`/eventos/${cercana.primerEvento}/omitida`, otro.token, {})).status).toBe(404);
  });

  it('vencido el plazo, la toma queda fija', async () => {
    const [{ id }] = await ds.query(`SELECT id FROM eventos_tratamiento WHERE recomendacion_id = ? AND estado = 'PENDIENTE' ORDER BY programado_en LIMIT 1`, [cercana.id]);
    await ds.query(`UPDATE eventos_tratamiento SET programado_en = (UTC_TIMESTAMP(6) - INTERVAL 3 DAY) WHERE id = ?`, [id]);
    const r = await c.post(`/eventos/${id}/realizada`, esc.paciente.token, {});
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('PLAZO_VENCIDO');
  });

  it('una toma sin marcar nunca se convierte en omitida, y el médico la ve como "sin registro"', async () => {
    const s = await c.get(`/seguimiento/indicacion/${cercana.id}`, esc.medico.token);
    expect(s.status).toBe(200);
    expect(s.body.rotulo).toBe('Autorreporte del paciente');
    expect(s.body.totales.realizadas).toBe(1);
    expect(s.body.totales.omitidas).toBe(0);
    expect(s.body.totales.sinRegistro).toBeGreaterThanOrEqual(1);
    const [{ n }] = await ds.query(`SELECT COUNT(*) AS n FROM eventos_tratamiento WHERE recomendacion_id = ? AND estado = 'OMITIDA'`, [cercana.id]);
    expect(Number(n)).toBe(0);
  });

  it('el resumen de avisos informa los avisos sin leer', async () => {
    const r = await c.get('/notificaciones/resumen', esc.paciente.token);
    expect(r.body.sinLeer).toBeGreaterThanOrEqual(1);
    expect(r.body).toHaveProperty('tomasAtrasadas');
  });
});

describe('modificar, suspender y versiones', () => {
  it('modificar la pauta crea una versión nueva y conserva lo ya registrado', async () => {
    const antes = await c.get(`/calendario?${rango()}`, esc.paciente.token);
    const programadas = antes.body.eventos.filter((e) => e.recomendacion.id === esc.reco.id).length;
    // el paciente marca la primera toma de su tratamiento original para comprobar que se conserva
    const [{ id: marcada }] = await ds.query(`SELECT id FROM eventos_tratamiento WHERE recomendacion_id = ? ORDER BY programado_en LIMIT 1`, [esc.reco.id]);
    await ds.query(`UPDATE eventos_tratamiento SET estado = 'REALIZADA', registrado_en = UTC_TIMESTAMP(6) WHERE id = ?`, [marcada]);
    await c.post(`/recomendaciones/${esc.reco.id}/leida`, esc.paciente.token).catch(() => undefined);
    await c.patch(`/recomendaciones/${esc.reco.id}/leida`, esc.paciente.token);
    const nueva = { modo: 'CADA_N_HORAS', intervaloHoras: 12, inicioLocal: `${f.sumarDias(f.hoyLocal(), 2)} 08:00`, duracionDias: 4 };
    const r = await c.put(`/recomendaciones/${esc.reco.id}/pauta`, esc.medico.token, { pauta: nueva, dosis: '2 comprimidos', motivo: 'Aumento de dosis' });
    expect(r.status).toBe(200);
    expect(r.body.version).toBeGreaterThan(1);
    expect(r.body.dosis).toBe('2 comprimidos');
    expect(r.body.leidaAt).toBeNull();
    const despues = await c.get(`/calendario?${rango()}`, esc.paciente.token);
    const eventos = despues.body.eventos.filter((e) => e.recomendacion.id === esc.reco.id);
    const realizada = eventos.find((e) => e.id === String(marcada));
    expect(realizada.estado).toBe('REALIZADA');
    expect(realizada.recomendacion.dosis).toBe('1 comprimido');
    const anuladas = eventos.filter((e) => e.estado === 'ANULADA');
    expect(anuladas.length).toBe(programadas - 1);
    expect(anuladas.every((e) => e.motivoAnulacion === 'Pauta modificada')).toBe(true);
    const nuevos = eventos.filter((e) => e.estado === 'PENDIENTE' && e.recomendacion.dosis === '2 comprimidos');
    expect(nuevos).toHaveLength(8);
    const d = await c.get(`/recomendaciones/${esc.reco.id}`, esc.medico.token);
    expect(d.body.versiones).toHaveLength(1);
    expect(d.body.versiones[0].motivo).toBe('Aumento de dosis');
    expect(d.body.versiones[0].contenido.dosis).toBe('1 comprimido');
    expect(d.body.pautasAnteriores).toHaveLength(1);
    expect(d.body.pautaVigente.intervaloHoras).toBe(12);
    expect(d.body.aviso).toMatch(/no reemplaza la receta/);
  });

  it('el paciente es avisado del cambio', async () => {
    const r = await c.get('/notificaciones?soloNoLeidas=true', esc.paciente.token);
    expect(r.body.items.some((n) => n.tipo === 'INDICACION_MODIFICADA')).toBe(true);
  });

  it('solo el autor modifica la indicación; otro médico del paciente puede suspenderla con motivo', async () => {
    const nueva = { modo: 'CADA_N_HORAS', intervaloHoras: 6, inicioLocal: manana(), duracionDias: 2 };
    expect((await c.put(`/recomendaciones/${esc.reco.id}/pauta`, esc.medico2.token, { pauta: nueva, motivo: 'Intento' })).status).toBe(403);
    expect((await c.patch(`/recomendaciones/${esc.reco.id}`, esc.medico2.token, { titulo: 'Otro título', motivo: 'Intento' })).status).toBe(403);
    expect((await c.post(`/recomendaciones/${esc.reco.id}/suspender`, esc.medico2.token, {})).status).toBe(400);
    const r = await c.post(`/recomendaciones/${esc.reco.id}/suspender`, esc.medico2.token, { motivo: 'Interacción con otro medicamento' });
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('SUSPENDIDA');
  });

  it('suspender anula las tomas futuras, que siguen visibles con su motivo', async () => {
    const cal = await c.get(`/calendario?${rango()}`, esc.paciente.token);
    const eventos = cal.body.eventos.filter((e) => e.recomendacion.id === esc.reco.id);
    expect(eventos.filter((e) => e.estado === 'PENDIENTE')).toHaveLength(0);
    expect(eventos.some((e) => e.motivoAnulacion === 'Indicación suspendida')).toBe(true);
    const mias = await c.get('/recomendaciones/mias?estado=anteriores', esc.paciente.token);
    expect(mias.body.items.map((x) => x.id)).toContain(esc.reco.id);
    const vigentes = await c.get('/recomendaciones/mias?estado=vigentes', esc.paciente.token);
    expect(vigentes.body.items.map((x) => x.id)).not.toContain(esc.reco.id);
  });

  it('una indicación suspendida ya no se modifica', async () => {
    const r = await c.put(`/recomendaciones/${esc.reco.id}/pauta`, esc.medico.token, { pauta: pautaOcho(), motivo: 'Reactivar' });
    expect(r.status).toBe(400);
  });

  it('corregir el texto guarda la versión anterior; cambiar la dosis de una indicación con pauta exige modificar la pauta', async () => {
    const r = await c.post('/recomendaciones', esc.medico.token, paracetamol({ titulo: 'Ibuprofeno', medicamento: 'Ibuprofeno' }));
    expect((await c.patch(`/recomendaciones/${r.body.id}`, esc.medico.token, { dosis: '2 comprimidos', motivo: 'Cambio' })).status).toBe(400);
    const e = await c.patch(`/recomendaciones/${r.body.id}`, esc.medico.token, { titulo: 'Ibuprofeno 400 mg', motivo: 'Precisión del título' });
    expect(e.status).toBe(200);
    expect(e.body.titulo).toBe('Ibuprofeno 400 mg');
    const d = await c.get(`/recomendaciones/${r.body.id}`, esc.medico.token);
    expect(d.body.versiones[0].contenido.titulo).toBe('Ibuprofeno');
  });

  it('acortar el tratamiento anula las tomas posteriores; extenderlo exige modificar la pauta', async () => {
    const r = await c.post('/recomendaciones', esc.medico.token, paracetamol({ titulo: 'Para acortar' }));
    const fin = f.sumarDias(f.hoyLocal(), 3);
    expect((await c.patch(`/recomendaciones/${r.body.id}`, esc.medico.token, { fechaFin: f.sumarDias(f.hoyLocal(), 20), motivo: 'Extender' })).status).toBe(400);
    expect((await c.patch(`/recomendaciones/${r.body.id}`, esc.medico.token, { fechaFin: fin, motivo: 'Mejoró antes' })).status).toBe(200);
    const cal = await c.get(`/calendario?${rango()}`, esc.paciente.token);
    const eventos = cal.body.eventos.filter((e) => e.recomendacion.id === r.body.id);
    expect(eventos.filter((e) => e.estado === 'ANULADA').length).toBeGreaterThan(0);
    expect(eventos.filter((e) => e.estado === 'PENDIENTE' && f.utcALocal(new Date(e.programadoEn)).fecha > fin)).toHaveLength(0);
  });

  it('marcar como leída es idempotente y conserva la fecha original', async () => {
    const r = await c.post('/recomendaciones', esc.medico.token, { pacienteId: esc.paciente.id, tipo: 'OTRO', titulo: 'Control en dos semanas', descripcion: 'Pida una hora de control.' });
    const a = await c.patch(`/recomendaciones/${r.body.id}/leida`, esc.paciente.token);
    await new Promise((x) => setTimeout(x, 50));
    const b = await c.patch(`/recomendaciones/${r.body.id}/leida`, esc.paciente.token);
    expect(a.body.leidaAt).toBe(b.body.leidaAt);
    expect((await c.patch(`/recomendaciones/${r.body.id}/leida`, esc.recepcion.token)).status).toBe(403);
  });
});

describe('seguimiento para el médico', () => {
  it('el dashboard clasifica al paciente y lo rotula como autorreporte', async () => {
    const r = await c.get('/dashboard/medico', esc.medico.token);
    expect(r.status).toBe(200);
    expect(r.body.rotulo).toMatch(/autorreporte/);
    const fila = r.body.pacientes.find((p) => p.id === esc.paciente.id);
    expect(['AL_DIA', 'EN_RIESGO', 'DESERTOR', 'CERRADO']).toContain(fila.estado);
    expect(fila.motivo).toBeTruthy();
    const filtrado = await c.get('/dashboard/medico?estado=DESERTOR', esc.medico.token);
    expect(filtrado.body.pacientes.every((p) => p.estado === 'DESERTOR')).toBe(true);
  });

  it('un paciente recién asignado con una indicación nueva no aparece como desertor', async () => {
    const nuevo = await c.crearPaciente(esc.recepcion, 'Reciente');
    await c.post('/relaciones', esc.recepcion.token, { medicoId: esc.medico.id, pacienteId: nuevo.id });
    await c.post('/recomendaciones', esc.medico.token, { pacienteId: nuevo.id, tipo: 'RUTINA', titulo: 'Caminata diaria', descripcion: 'Camine 30 minutos al día.' });
    const r = await c.get('/dashboard/medico', esc.medico.token);
    expect(r.body.pacientes.find((p) => p.id === nuevo.id).estado).not.toBe('DESERTOR');
  });

  it('el resumen de un paciente incluye continuidad, lectura, tomas y citas', async () => {
    const r = await c.get(`/seguimiento/paciente/${esc.paciente.id}`, esc.medico.token);
    expect(r.status).toBe(200);
    expect(r.body.lectura.enviadas).toBeGreaterThan(0);
    expect(r.body.tomas.realizadas).toBeGreaterThanOrEqual(1);
    expect(r.body.citas).toHaveProperty('atendidas');
  });

  it('un médico no ve el seguimiento de pacientes de otro', async () => {
    const otro = await c.crearPaciente(esc.recepcion, 'Ajeno');
    expect((await c.get(`/seguimiento/paciente/${otro.id}`, esc.medico.token)).status).toBe(404);
    const dash = await c.get('/dashboard/medico', esc.medico.token);
    expect(dash.body.pacientes.map((p) => p.id)).not.toContain(otro.id);
  });

  it('el dashboard del centro es agregado, sin nombres, y oculta los grupos de menos de 5', async () => {
    const r = await c.get('/dashboard/centro', esc.admin.token);
    expect(r.status).toBe(200);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/Paula|Mario|Prueba/);
    for (const g of r.body.porEspecialidad) for (const k of ['alDia', 'enRiesgo', 'desertores', 'cerrados']) {
      if (g[k].menosDe5) expect(g[k].cantidad).toBeNull();
    }
    expect(r.body.porEspecialidad.length).toBeGreaterThan(0);
  });

  it('la lectura de indicaciones se cuenta por paciente y por tipo', async () => {
    const r = await c.get('/dashboard/lectura', esc.medico.token);
    expect(r.body.enviadas).toBeGreaterThan(0);
    expect(r.body.porTipo.length).toBeGreaterThan(0);
  });
});

describe('jornada de atención de un día', () => {
  let cita;
  it('recepción registra la llegada, el médico atiende y la cita se cierra con su atención', async () => {
    const inicio = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const r = await ds.query(
      `INSERT INTO citas (medico_id, paciente_id, inicio, fin, estado, tipo, canal, creada_por, slot_activo) VALUES (?, ?, ?, ?, 'RESERVADA', 'CONTROL', 'MESON', ?, ?)`,
      [esc.medico.id, esc.paciente.id, inicio, new Date(inicio.getTime() + 1_800_000), esc.recepcion.id, inicio],
    );
    cita = r.insertId;
    const llegada = await c.post(`/citas/${cita}/llegada`, esc.recepcion.token);
    expect(llegada.status).toBe(200);
    expect(llegada.body.estado).toBe('EN_ESPERA');
    const aviso = await c.get('/notificaciones', esc.medico.token);
    expect(aviso.body.items.some((n) => n.tipo === 'PACIENTE_EN_ESPERA')).toBe(true);
    const agenda = await c.get(`/medico/citas?fecha=${f.hoyLocal()}`, esc.medico.token);
    expect(agenda.body.find((x) => x.id === cita).estado).toBe('EN_ESPERA');
    expect((await c.post(`/citas/${cita}/iniciar`, esc.medico.token)).body.estado).toBe('EN_ATENCION');
  });

  it('no se puede cerrar la cita sin una atención cerrada, salvo que el médico declare que no hubo', async () => {
    const sin = await c.post(`/citas/${cita}/finalizar`, esc.medico.token, {});
    expect(sin.status).toBe(409);
    expect(sin.body.codigo).toBe('ATENCION_PENDIENTE');
    const at = await c.post('/atenciones', esc.medico.token, { pacienteId: esc.paciente.id, citaId: cita, motivo: 'Control', anamnesis: 'Sin novedades.' });
    expect((await c.post(`/atenciones/${at.body.id}/cerrar`, esc.medico.token)).status).toBe(200);
    const fin = await c.post(`/citas/${cita}/finalizar`, esc.medico.token, {});
    expect(fin.status).toBe(200);
    expect(fin.body.estado).toBe('ATENDIDA');
  });

  it('una cita atendida no cambia de estado', async () => {
    expect((await c.post(`/citas/${cita}/no-asistio`, esc.recepcion.token)).status).toBe(400);
    expect((await c.post(`/citas/${cita}/cancelar`, esc.recepcion.token, { motivo: 'Ya fue atendida' })).status).toBe(400);
  });

  it('el historial de estados registra quién hizo cada cambio', async () => {
    const d = await c.get(`/citas/${cita}`, esc.medico.token);
    expect(d.body.historial.map((h) => h.estadoNuevo)).toEqual(['EN_ESPERA', 'EN_ATENCION', 'ATENDIDA']);
  });

  it('una inasistencia solo se marca cuando la cita ya ocurrió', async () => {
    const futura = await c.post(`/citas/${esc.cita.id}/no-asistio`, esc.recepcion.token);
    expect(futura.status).toBe(400);
  });
});
