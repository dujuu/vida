// @ts-nocheck
/** Reservas de horas: concurrencia, cancelación, reprogramación atómica y reglas de agenda. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Cliente, crearApp, escenario } from './ayuda.js';

let app, c, esc, ds;
beforeAll(async () => {
  app = await crearApp();
  c = new Cliente(app);
  ds = app.get(DataSource);
  esc = await escenario(c);
});
afterAll(async () => app?.close());

describe('reserva de horas', () => {
  it('20 reservas simultáneas de la misma hora: exactamente 1 éxito y 19 rechazos 409', async () => {
    const pacientes = [];
    for (let i = 0; i < 20; i++) pacientes.push(await c.crearPaciente(esc.recepcion, `Concurrente${String.fromCharCode(65 + i)}`));
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico2.id);
    const hora = horas[3];
    const resultados = await Promise.all(pacientes.map((p) => c.post('/citas', p.token, { medicoId: esc.medico2.id, inicio: hora.inicio })));
    const exitos = resultados.filter((r) => r.status === 201);
    const conflictos = resultados.filter((r) => r.status === 409);
    expect(resultados.filter((r) => r.status >= 500)).toHaveLength(0);
    expect(exitos).toHaveLength(1);
    expect(conflictos).toHaveLength(19);
    expect(conflictos.every((r) => r.body.codigo === 'HORA_NO_DISPONIBLE')).toBe(true);
    const [{ n }] = await ds.query(`SELECT COUNT(*) AS n FROM citas WHERE medico_id = ? AND inicio = ? AND estado <> 'CANCELADA'`, [esc.medico2.id, hora.inicio.replace('Z', '')]);
    expect(Number(n)).toBe(1);
  });

  it('la hora reservada deja de aparecer como libre', async () => {
    const libres = await c.horasLibres(esc.recepcion.token, esc.medico.id);
    expect(libres.map((h) => h.inicio)).not.toContain(esc.cita.inicio);
  });

  it('cancelar libera la hora y otra persona puede tomarla', async () => {
    const otro = await c.crearPaciente(esc.recepcion, 'Otro');
    const cancelar = await c.post(`/citas/${esc.cita.id}/cancelar`, esc.paciente.token, { motivo: 'No puedo asistir' });
    expect(cancelar.status).toBe(200);
    expect(cancelar.body.estado).toBe('CANCELADA');
    const libres = await c.horasLibres(esc.recepcion.token, esc.medico.id);
    expect(libres.map((h) => h.inicio)).toContain(esc.cita.inicio);
    const r = await c.post('/citas', otro.token, { medicoId: esc.medico.id, inicio: esc.cita.inicio });
    expect(r.status).toBe(201);
    esc.citaOtro = r.body;
    esc.otro = otro;
  });

  it('el mismo paciente no puede tener dos citas a la misma hora con dos médicos', async () => {
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico.id);
    const hora = horas.find((h) => h.inicio !== esc.cita.inicio);
    const a = await c.post('/citas', esc.paciente.token, { medicoId: esc.medico.id, inicio: hora.inicio });
    expect(a.status).toBe(201);
    const b = await c.post('/citas', esc.paciente.token, { medicoId: esc.medico2.id, inicio: hora.inicio });
    expect(b.status).toBe(409);
    expect(b.body.codigo).toBe('PACIENTE_OCUPADO');
    esc.citaPaciente = a.body;
  });

  it('reprogramar a una hora tomada no pierde la cita original', async () => {
    const r = await c.post(`/citas/${esc.citaPaciente.id}/reprogramar`, esc.paciente.token, { inicio: esc.citaOtro.inicio });
    expect(r.status).toBe(409);
    const original = await c.get(`/citas/${esc.citaPaciente.id}`, esc.paciente.token);
    expect(original.body.estado).toBe('RESERVADA');
    const libres = await c.horasLibres(esc.recepcion.token, esc.medico.id);
    expect(libres.map((h) => h.inicio)).not.toContain(esc.citaPaciente.inicio);
  });

  it('reprogramar a una hora libre cancela la anterior y crea la nueva en una sola operación', async () => {
    const libres = await c.horasLibres(esc.recepcion.token, esc.medico.id);
    const nueva = libres[libres.length - 1];
    const r = await c.post(`/citas/${esc.citaPaciente.id}/reprogramar`, esc.paciente.token, { inicio: nueva.inicio });
    expect(r.status).toBe(200);
    expect(r.body.reprogramadaDesde).toBe(esc.citaPaciente.id);
    const vieja = await c.get(`/citas/${esc.citaPaciente.id}`, esc.paciente.token);
    expect(vieja.body.estado).toBe('CANCELADA');
    esc.citaPaciente = r.body;
  });

  it('rechaza una hora que no está en la grilla del médico', async () => {
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico.id);
    const raro = new Date(new Date(horas[0].inicio).getTime() + 7 * 60_000).toISOString();
    const r = await c.post('/citas', esc.recepcion.token, { medicoId: esc.medico.id, pacienteId: esc.paciente.id, inicio: raro });
    expect(r.status).toBe(409);
  });

  it('un paciente no puede reservar para otra persona', async () => {
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico.id);
    const r = await c.post('/citas', esc.paciente.token, { medicoId: esc.medico.id, pacienteId: esc.otro.id, inicio: horas[2].inicio });
    expect(r.status).toBe(403);
  });

  it('el paciente tiene un tope de citas futuras activas; recepción puede superarlo', async () => {
    const p = await c.crearPaciente(esc.recepcion, 'Tope');
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico2.id, 20);
    const libres = horas.filter((h, i) => i % 2 === 0).slice(0, 5);
    const estados = [];
    for (const h of libres.slice(0, 4)) estados.push((await c.post('/citas', p.token, { medicoId: esc.medico2.id, inicio: h.inicio })).status);
    expect(estados).toEqual([201, 201, 201, 400]);
    const rec = await c.post('/citas', esc.recepcion.token, { medicoId: esc.medico2.id, pacienteId: p.id, inicio: libres[3].inicio });
    expect(rec.status).toBe(201);
  });

  it('el paciente no puede cancelar fuera de plazo; recepción sí', async () => {
    await c.put('/configuracion', esc.admin.token, { valores: { cancelacion_horas: 168 } });
    const p = await c.crearPaciente(esc.recepcion, 'Plazo');
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico2.id);
    const cita = (await c.post('/citas', p.token, { medicoId: esc.medico2.id, inicio: horas[horas.length - 1].inicio })).body;
    const citaCercana = (await c.post('/citas', esc.recepcion.token, { medicoId: esc.medico2.id, pacienteId: p.id, inicio: horas[0].inicio })).body;
    const r = await c.post(`/citas/${citaCercana.id}/cancelar`, p.token, { motivo: 'Fuera de plazo' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/horas antes/);
    const rec = await c.post(`/citas/${citaCercana.id}/cancelar`, esc.recepcion.token, { motivo: 'Autorizado por recepción' });
    expect(rec.status).toBe(200);
    await c.put('/configuracion', esc.admin.token, { valores: { cancelacion_horas: 12 } });
    expect(cita.id).toBeGreaterThan(0);
  });

  it('un feriado no ofrece horas y no se puede reservar en él', async () => {
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico.id, 20);
    const dia = horas[horas.length - 1].inicio;
    const { utcALocal } = await import('../dist/common/fechas.util.js');
    const fecha = utcALocal(new Date(dia)).fecha;
    const f = await c.post('/feriados', esc.admin.token, { fecha, nombre: 'Feriado de prueba' });
    expect(f.status).toBe(201);
    const r = await c.post('/citas', esc.recepcion.token, { medicoId: esc.medico.id, pacienteId: esc.paciente.id, inicio: dia });
    expect(r.status).toBe(409);
    const libres = await c.horasLibres(esc.recepcion.token, esc.medico.id, 20);
    expect(libres.every((h) => utcALocal(new Date(h.inicio)).fecha !== fecha)).toBe(true);
    await c.delete(`/feriados/${fecha}`, esc.admin.token);
  });

  it('un bloqueo con citas dentro exige confirmar y no las cancela', async () => {
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico2.id);
    const h = horas[1];
    const p = await c.crearPaciente(esc.recepcion, 'Bloqueo');
    const cita = (await c.post('/citas', p.token, { medicoId: esc.medico2.id, inicio: h.inicio })).body;
    const { utcALocal } = await import('../dist/common/fechas.util.js');
    const l = utcALocal(new Date(h.inicio));
    const cuerpo = { fechaDesde: l.fecha, horaDesde: '00:00', fechaHasta: l.fecha, horaHasta: '23:59', motivo: 'PERMISO' };
    const sin = await c.post(`/agenda/${esc.medico2.id}/bloqueos`, esc.medico2.token, cuerpo);
    expect(sin.status).toBe(409);
    expect(sin.body.citasAfectadas.map((x) => x.id)).toContain(cita.id);
    const con = await c.post(`/agenda/${esc.medico2.id}/bloqueos`, esc.medico2.token, { ...cuerpo, confirmar: true });
    expect(con.status).toBe(201);
    const sigue = await c.get(`/citas/${cita.id}`, p.token);
    expect(sigue.body.estado).toBe('RESERVADA');
    const libres = await c.horasLibres(esc.recepcion.token, esc.medico2.id);
    expect(libres.every((x) => utcALocal(new Date(x.inicio)).fecha !== l.fecha)).toBe(true);
  });

  it('un médico no puede modificar la agenda de otro', async () => {
    const r = await c.put(`/agenda/${esc.medico2.id}/bloques`, esc.medico.token, { desde: '2030-01-01', bloques: [] });
    expect(r.status).toBe(403);
  });

  it('la llegada solo se registra el día de la cita', async () => {
    const r = await c.post(`/citas/${esc.citaPaciente.id}/llegada`, esc.recepcion.token);
    expect(r.status).toBe(400);
  });

  it('el paciente solo ve sus propias citas', async () => {
    const r = await c.get(`/citas/${esc.citaOtro.id}`, esc.paciente.token);
    expect(r.status).toBe(404);
  });

  it('el administrador ve la agenda pero no las notas de las citas', async () => {
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico.id);
    const rc = await c.post('/citas', esc.recepcion.token, { medicoId: esc.medico.id, pacienteId: esc.paciente.id, inicio: horas[4].inicio, nota: 'Trae exámenes' });
    expect(rc.status).toBe(201);
    const { utcALocal } = await import('../dist/common/fechas.util.js');
    const fecha = utcALocal(new Date(rc.body.inicio)).fecha;
    const rec = await c.get(`/citas?fecha=${fecha}&medico=${esc.medico.id}&tamano=100`, esc.recepcion.token);
    const adm = await c.get(`/citas?fecha=${fecha}&medico=${esc.medico.id}&tamano=100`, esc.admin.token);
    expect(rec.body.items.find((x) => x.id === rc.body.id).nota).toBe('Trae exámenes');
    expect(adm.body.items.find((x) => x.id === rc.body.id).nota).toBeNull();
  });
});
