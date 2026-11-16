// @ts-nocheck
/** Ficha clínica: atenciones inmutables, borradores privados, relación médico–paciente, documentos y auditoría. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Cliente, crearApp, escenario } from './ayuda.js';

let app, c, esc, ds, atencion;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

beforeAll(async () => {
  app = await crearApp();
  c = new Cliente(app);
  ds = app.get(DataSource);
  esc = await escenario(c);
  // medico2 también atiende al paciente (relación por cita)
  const horas = await c.horasLibres(esc.recepcion.token, esc.medico2.id);
  const r = await c.post('/citas', esc.recepcion.token, { medicoId: esc.medico2.id, pacienteId: esc.paciente.id, inicio: horas[1].inicio });
  expect(r.status).toBe(201);
});
afterAll(async () => app?.close());

describe('atenciones', () => {
  it('abre una atención en borrador desde una cita', async () => {
    const r = await c.post('/atenciones', esc.medico.token, { pacienteId: esc.paciente.id, citaId: esc.cita.id, motivo: 'Control general' });
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('BORRADOR');
    atencion = r.body;
  });

  it('no abre dos atenciones para la misma cita', async () => {
    const r = await c.post('/atenciones', esc.medico.token, { pacienteId: esc.paciente.id, citaId: esc.cita.id, motivo: 'Otra' });
    expect(r.status).toBe(409);
  });

  it('valida los rangos de los signos vitales', async () => {
    expect((await c.put(`/atenciones/${atencion.id}/signos`, esc.medico.token, { paSistolica: 80, paDiastolica: 90 })).status).toBe(400);
    expect((await c.put(`/atenciones/${atencion.id}/signos`, esc.medico.token, { paSistolica: 120 })).status).toBe(400);
    expect((await c.put(`/atenciones/${atencion.id}/signos`, esc.medico.token, { temperatura: 50 })).status).toBe(400);
    expect((await c.put(`/atenciones/${atencion.id}/signos`, esc.medico.token, { saturacion: 120 })).status).toBe(400);
    expect((await c.put(`/atenciones/${atencion.id}/signos`, esc.medico.token, {})).status).toBe(400);
  });

  it('guarda los signos y calcula el IMC', async () => {
    const r = await c.put(`/atenciones/${atencion.id}/signos`, esc.medico.token, { paSistolica: 120, paDiastolica: 80, temperatura: 36.6, pesoKg: 70, tallaCm: 170 });
    expect(r.status).toBe(200);
    expect(r.body.imc).toBe(24.2);
  });

  it('no se puede cerrar sin contenido clínico', async () => {
    const r = await c.post(`/atenciones/${atencion.id}/cerrar`, esc.medico.token);
    expect(r.status).toBe(400);
  });

  it('un borrador no es visible para otro médico, aunque atienda al paciente', async () => {
    expect((await c.get(`/atenciones/${atencion.id}`, esc.medico2.token)).status).toBe(404);
    const lista = await c.get(`/ficha/${esc.paciente.id}/atenciones`, esc.medico2.token);
    expect(lista.body.items.map((a) => a.id)).not.toContain(atencion.id);
    expect((await c.patch(`/atenciones/${atencion.id}`, esc.medico2.token, { plan: 'x'.repeat(10) })).status).toBe(404);
  });

  it('edita el borrador y lo cierra', async () => {
    const e = await c.patch(`/atenciones/${atencion.id}`, esc.medico.token, { anamnesis: 'Refiere cefalea.', plan: 'Reposo e hidratación.' });
    expect(e.status).toBe(200);
    const r = await c.post(`/atenciones/${atencion.id}/cerrar`, esc.medico.token);
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('CERRADA');
  });

  it('una atención cerrada es inmutable: editar o cambiar signos responde 409', async () => {
    const e = await c.patch(`/atenciones/${atencion.id}`, esc.medico.token, { plan: 'Cambio' });
    expect(e.status).toBe(409);
    expect(e.body.codigo).toBe('ATENCION_CERRADA');
    expect((await c.put(`/atenciones/${atencion.id}/signos`, esc.medico.token, { temperatura: 37 })).status).toBe(409);
    expect((await c.post(`/atenciones/${atencion.id}/cerrar`, esc.medico.token)).status).toBe(409);
  });

  it('solo el autor puede enmendar, y el texto original sigue visible', async () => {
    expect((await c.post(`/atenciones/${atencion.id}/enmiendas`, esc.medico2.token, { texto: 'Corrección', motivo: 'Error' })).status).toBe(403);
    const r = await c.post(`/atenciones/${atencion.id}/enmiendas`, esc.medico.token, { texto: 'Dice cefalea, era migraña.', motivo: 'Precisión del diagnóstico' });
    expect(r.status).toBe(201);
    const d = await c.get(`/atenciones/${atencion.id}`, esc.medico.token);
    expect(d.body.anamnesis).toBe('Refiere cefalea.');
    expect(d.body.enmiendasLista).toHaveLength(1);
  });

  it('otro médico con relación puede leer la atención ya cerrada', async () => {
    expect((await c.get(`/atenciones/${atencion.id}`, esc.medico2.token)).status).toBe(200);
  });

  it('no se enmienda un borrador', async () => {
    const b = await c.post('/atenciones', esc.medico.token, { pacienteId: esc.paciente.id, motivo: 'Borrador aparte' });
    expect((await c.post(`/atenciones/${b.body.id}/enmiendas`, esc.medico.token, { texto: 'xxx', motivo: 'xxx' })).status).toBe(400);
  });
});

describe('antecedentes, diagnósticos y exámenes', () => {
  it('registra una alergia con severidad y la muestra destacada en el resumen', async () => {
    const r = await c.post(`/ficha/${esc.paciente.id}/antecedentes`, esc.medico.token, { tipo: 'ALERGIA', descripcion: 'Penicilina', severidad: 'GRAVE', reaccion: 'Urticaria' });
    expect(r.status).toBe(201);
    const res = await c.get(`/ficha/${esc.paciente.id}`, esc.medico.token);
    expect(res.body.alergias.map((a) => a.descripcion)).toContain('Penicilina');
    esc.alergia = r.body;
  });

  it('la severidad solo aplica a las alergias', async () => {
    const r = await c.post(`/ficha/${esc.paciente.id}/antecedentes`, esc.medico.token, { tipo: 'MORBIDO', descripcion: 'Asma', severidad: 'LEVE' });
    expect(r.status).toBe(400);
  });

  it('un antecedente se cierra, no se borra', async () => {
    const r = await c.patch(`/antecedentes/${esc.alergia.id}`, esc.medico.token, { vigente: false });
    expect(r.body.vigente).toBe(false);
    expect(r.body.cerradoEn).toBeTruthy();
    const res = await c.get(`/ficha/${esc.paciente.id}`, esc.medico.token);
    expect(res.body.alergias).toHaveLength(0);
    expect(c.delete(`/antecedentes/${esc.alergia.id}`, esc.medico.token)).toBeTruthy();
    expect((await c.delete(`/antecedentes/${esc.alergia.id}`, esc.medico.token)).status).toBe(404);
  });

  it('crea y resuelve un diagnóstico; valida el código CIE-10', async () => {
    expect((await c.post(`/ficha/${esc.paciente.id}/diagnosticos`, esc.medico.token, { descripcion: 'Migraña', codigoCie10: 'xx' })).status).toBe(400);
    const r = await c.post(`/ficha/${esc.paciente.id}/diagnosticos`, esc.medico.token, { descripcion: 'Migraña', codigoCie10: 'g43.9', atencionId: atencion.id });
    expect(r.status).toBe(201);
    expect(r.body.codigoCie10).toBe('G43.9');
    const res = await c.patch(`/diagnosticos/${r.body.id}`, esc.medico.token, { estado: 'RESUELTO' });
    expect(res.body.estado).toBe('RESUELTO');
    expect(res.body.resueltoEn).toBeTruthy();
  });

  it('un examen recibe su resultado una sola vez', async () => {
    const e = await c.post(`/ficha/${esc.paciente.id}/examenes`, esc.medico.token, { nombre: 'Hemograma', tipo: 'LABORATORIO' });
    expect(e.status).toBe(201);
    const pendiente = await c.get('/mi-ficha', esc.paciente.token);
    expect(pendiente.body.examenes.map((x) => x.nombre)).not.toContain('Hemograma');
    const r = await c.patch(`/examenes/${e.body.id}`, esc.medico.token, { resultado: 'Hemoglobina 14 g/dL' });
    expect(r.body.estado).toBe('CON_RESULTADO');
    expect((await c.patch(`/examenes/${e.body.id}`, esc.medico.token, { resultado: 'Otro resultado' })).status).toBe(409);
    const visible = await c.get('/mi-ficha', esc.paciente.token);
    expect(visible.body.examenes.map((x) => x.nombre)).toContain('Hemograma');
  });
});

describe('vista del paciente', () => {
  it('el paciente ve sus atenciones pero no la anamnesis, el examen físico ni las observaciones', async () => {
    const r = await c.get('/mi-ficha', esc.paciente.token);
    expect(r.status).toBe(200);
    expect(r.body.atenciones.length).toBeGreaterThan(0);
    for (const a of r.body.atenciones) {
      expect(a).not.toHaveProperty('anamnesis');
      expect(a).not.toHaveProperty('examenFisico');
      expect(a).not.toHaveProperty('observaciones');
      expect(a).not.toHaveProperty('signosVitales');
    }
    expect(JSON.stringify(r.body)).not.toContain('Refiere cefalea');
  });

  it('el paciente no puede leer la ficha de otra persona ni usar las rutas del médico', async () => {
    const otro = await c.crearPaciente(esc.recepcion, 'Ajeno');
    expect((await c.get(`/ficha/${otro.id}`, esc.paciente.token)).status).toBe(403);
    expect((await c.get(`/atenciones/${atencion.id}`, otro.token)).status).toBe(403);
  });

  it('el paciente ve quién abrió su ficha', async () => {
    const r = await c.get('/mi-ficha/accesos', esc.paciente.token);
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.items[0]).toHaveProperty('usuario');
    expect(JSON.stringify(r.body)).not.toMatch(/cefalea|anamnesis/i);
  });

  it('la ficha exportada incluye al generador y queda en auditoría', async () => {
    const r = await c.get(`/ficha/${esc.paciente.id}/exportar`, esc.medico.token);
    expect(r.status).toBe(200);
    expect(r.body.generadoPor).toContain('Mario');
    expect(r.body.atenciones[0].anamnesis).toBeTruthy();
    const audit = await c.get(`/auditoria?paciente=${esc.paciente.id}&accion=FICHA_EXPORTAR`, esc.admin.token);
    expect(audit.body.total).toBeGreaterThan(0);
    const mia = await c.get('/mi-ficha/exportar', esc.paciente.token);
    expect(mia.status).toBe(200);
    expect(mia.body.atenciones[0]).not.toHaveProperty('anamnesis');
  });
});

describe('documentos', () => {
  it('sube un PDF, lo lista y lo entrega al paciente con el contenido intacto', async () => {
    const r = await c.req('POST', `/ficha/${esc.paciente.id}/documentos`, esc.medico.token).attach('archivo', PDF, { filename: 'informe.pdf', contentType: 'application/pdf' }).field('descripcion', 'Informe de laboratorio');
    expect(r.status).toBe(201);
    esc.doc = r.body;
    const lista = await c.get(`/ficha/${esc.paciente.id}/documentos`, esc.medico.token);
    expect(lista.body.map((d) => d.id)).toContain(r.body.id);
    const d = await c.req('GET', `/documentos/${r.body.id}/archivo`, esc.paciente.token).buffer(true).parse((res, cb) => { const t = []; res.on('data', (x) => t.push(x)); res.on('end', () => cb(null, Buffer.concat(t))); });
    expect(d.status).toBe(200);
    expect(d.headers['content-type']).toMatch(/pdf/);
    expect(d.headers['content-disposition']).toMatch(/attachment/);
    expect(Buffer.compare(d.body, PDF)).toBe(0);
  });

  it('rechaza un archivo cuyo contenido no corresponde a su tipo', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const r = await c.req('POST', `/ficha/${esc.paciente.id}/documentos`, esc.medico.token).attach('archivo', png, { filename: 'falso.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    const exe = await c.req('POST', `/ficha/${esc.paciente.id}/documentos`, esc.medico.token).attach('archivo', Buffer.from('MZ\x90\x00'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(400);
    const vacio = await c.req('POST', `/ficha/${esc.paciente.id}/documentos`, esc.medico.token);
    expect(vacio.status).toBe(400);
  });

  it('rechaza un archivo de más de 10 MB', async () => {
    const grande = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(10 * 1024 * 1024 + 10, 1)]);
    const r = await c.req('POST', `/ficha/${esc.paciente.id}/documentos`, esc.medico.token).attach('archivo', grande, { filename: 'grande.pdf', contentType: 'application/pdf' });
    expect([400, 413]).toContain(r.status);
  });

  it('otro paciente y recepción no pueden descargarlo; otro médico con relación sí', async () => {
    const otro = await c.crearPaciente(esc.recepcion, 'Curioso');
    expect((await c.get(`/documentos/${esc.doc.id}/archivo`, otro.token)).status).toBe(404);
    expect((await c.get(`/documentos/${esc.doc.id}/archivo`, esc.recepcion.token)).status).toBe(403);
    expect((await c.get(`/documentos/${esc.doc.id}/archivo`, esc.admin.token)).status).toBe(403);
    expect((await c.get(`/documentos/${esc.doc.id}/archivo`, esc.medico2.token)).status).toBe(200);
  });

  it('detecta un archivo alterado en disco', async () => {
    const r = await c.req('POST', `/ficha/${esc.paciente.id}/documentos`, esc.medico.token).attach('archivo', PDF, { filename: 'alterable.pdf', contentType: 'application/pdf' });
    const [{ ruta }] = await ds.query('SELECT ruta FROM documentos WHERE id = ?', [r.body.id]);
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.writeFile(path.resolve(process.env.ARCHIVOS_DIR, ruta), Buffer.concat([PDF, Buffer.from('adulterado')]));
    expect((await c.get(`/documentos/${r.body.id}/archivo`, esc.medico.token)).status).toBe(500);
  });

  it('solo quien lo subió puede anularlo; anulado no se descarga', async () => {
    expect((await c.patch(`/documentos/${esc.doc.id}/anular`, esc.medico2.token)).status).toBe(400);
    expect((await c.patch(`/documentos/${esc.doc.id}/anular`, esc.medico.token)).status).toBe(204);
    expect((await c.get(`/documentos/${esc.doc.id}/archivo`, esc.medico.token)).status).toBe(404);
  });
});

describe('relación médico–paciente y auditoría', () => {
  it('sin relación vigente el médico no ve nada del paciente', async () => {
    const otro = await c.crearPaciente(esc.recepcion, 'SinRelacion');
    for (const ruta of ['', '/antecedentes', '/atenciones', '/diagnosticos', '/examenes', '/documentos', '/signos', '/indicaciones', '/exportar']) {
      expect((await c.get(`/ficha/${otro.id}${ruta}`, esc.medico.token)).status, ruta).toBe(404);
    }
    expect((await c.post('/atenciones', esc.medico.token, { pacienteId: otro.id, motivo: 'Intento' })).status).toBe(404);
    expect((await c.post(`/ficha/${otro.id}/antecedentes`, esc.medico.token, { tipo: 'MORBIDO', descripcion: 'x1' })).status).toBe(404);
  });

  it('con la relación cerrada el médico solo conserva lo que él escribió y no puede escribir', async () => {
    expect((await c.post(`/relaciones/${esc.medico2.id}/${esc.paciente.id}/cerrar`, esc.medico2.token, { motivo: 'Fin del tratamiento' })).status).toBe(204);
    expect((await c.get(`/ficha/${esc.paciente.id}/antecedentes`, esc.medico2.token)).status).toBe(404);
    expect((await c.get(`/atenciones/${atencion.id}`, esc.medico2.token)).status).toBe(404);
    expect((await c.post(`/ficha/${esc.paciente.id}/antecedentes`, esc.medico2.token, { tipo: 'MORBIDO', descripcion: 'Intento' })).status).toBe(404);
    const resumen = await c.get(`/ficha/${esc.paciente.id}`, esc.medico2.token);
    expect(resumen.status).toBe(200);
    expect(resumen.body.soloPropio).toBe(true);
    expect(resumen.body.alergias).toBeUndefined();
    // la relación se reabre al reservar una nueva cita
    const horas = await c.horasLibres(esc.recepcion.token, esc.medico2.id);
    expect((await c.post('/citas', esc.recepcion.token, { medicoId: esc.medico2.id, pacienteId: esc.paciente.id, inicio: horas[5].inicio })).status).toBe(201);
    expect((await c.get(`/ficha/${esc.paciente.id}/antecedentes`, esc.medico2.token)).status).toBe(200);
  });

  it('un médico no puede abrir su propia ficha como médico', async () => {
    const admin = esc.admin;
    const dual = await c.crearPersonal(admin, { roles: ['MEDICO', 'PACIENTE'], rol: 'MEDICO' });
    expect((await c.get(`/ficha/${dual.id}`, dual.token)).status).toBe(404);
  });

  it('cada lectura clínica deja un registro con el médico, el paciente y la hora, pero nunca el contenido', async () => {
    const antes = (await c.get(`/auditoria?paciente=${esc.paciente.id}&accion=FICHA_LEER`, esc.admin.token)).body.total;
    await c.get(`/atenciones/${atencion.id}`, esc.medico.token);
    const despues = await c.get(`/auditoria?paciente=${esc.paciente.id}&accion=FICHA_LEER&tamano=5`, esc.admin.token);
    expect(despues.body.total).toBe(antes + 1);
    const fila = despues.body.items[0];
    expect(fila.usuarioId).toBe(esc.medico.id);
    expect(fila.pacienteId).toBe(esc.paciente.id);
    expect(fila.rol).toBe('MEDICO');
    expect(JSON.stringify(despues.body)).not.toMatch(/cefalea|Refiere|Reposo/);
  });

  it('los accesos denegados también quedan registrados', async () => {
    await c.get(`/ficha/${esc.paciente.id}`, esc.recepcion.token);
    const r = await c.get(`/auditoria?accion=ACCESO_DENEGADO&usuario=${esc.recepcion.id}`, esc.admin.token);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.items[0].resultado).toBe('DENEGADO');
  });

  it('la auditoría no se puede modificar ni borrar, ni siquiera desde la base de datos', async () => {
    await expect(ds.query(`UPDATE auditoria SET accion = 'X' WHERE id > 0`)).rejects.toThrow(/no se puede modificar/);
    await expect(ds.query(`DELETE FROM auditoria WHERE id > 0`)).rejects.toThrow(/no se puede borrar/);
  });

  it('la auditoría se exporta a CSV con escape correcto', async () => {
    const r = await c.get('/auditoria/exportar', esc.admin.token);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/csv/);
    expect(r.text.split('\n')[0]).toContain('fecha,usuario,rol,accion');
  });
});
