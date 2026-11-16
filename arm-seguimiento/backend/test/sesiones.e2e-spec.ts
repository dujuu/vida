// @ts-nocheck
/** Autenticación y sesiones: bloqueo por intentos, renovación rotativa, revocación, activación de cuentas y roles. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { ADMIN_RUT, Cliente, PASSWORD, crearApp, rutNuevo } from './ayuda.js';

let app, c, ds, admin;
beforeAll(async () => {
  app = await crearApp();
  c = new Cliente(app);
  ds = app.get(DataSource);
  admin = await c.login(ADMIN_RUT);
});
afterAll(async () => app?.close());

describe('inicio de sesión', () => {
  it('rechaza una contraseña incorrecta con el mismo mensaje que un RUT inexistente', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    const mala = await c.post('/auth/login', undefined, { rut: p.rut, password: 'incorrecta1' });
    const noExiste = await c.post('/auth/login', undefined, { rut: rutNuevo(), password: 'incorrecta1' });
    expect(mala.status).toBe(401);
    expect(noExiste.status).toBe(401);
    expect(mala.body.message).toBe(noExiste.body.message);
  });

  it('tras 5 intentos fallidos el RUT queda bloqueado, incluso con la contraseña correcta', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    for (let i = 0; i < 5; i++) expect((await c.post('/auth/login', undefined, { rut: p.rut, password: 'incorrecta1' })).status).toBe(401);
    const bloqueado = await c.post('/auth/login', undefined, { rut: p.rut, password: PASSWORD });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('un RUT inválido responde 400', async () => {
    expect((await c.post('/auth/login', undefined, { rut: '12345678-9', password: PASSWORD })).status).toBe(400);
  });

  it('una persona con varios roles entra sin rol activo y debe elegir perfil', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA', 'PACIENTE'], rol: 'RECEPCIONISTA' });
    const r = await c.post('/auth/login', undefined, { rut: p.rut, password: PASSWORD });
    expect(r.body.usuario.rol).toBeNull();
    expect(r.body.usuario.roles.sort()).toEqual(['PACIENTE', 'RECEPCIONISTA']);
    expect((await c.get('/pacientes', r.body.accessToken)).status).toBe(403);
    const e = await c.post('/auth/rol', r.body.accessToken, { rol: 'PACIENTE' });
    expect(e.body.usuario.rol).toBe('PACIENTE');
    expect((await c.get('/mi-perfil', e.body.accessToken)).status).toBe(200);
    expect((await c.get('/pacientes', e.body.accessToken)).status).toBe(403);
    const ajeno = await c.post('/auth/rol', r.body.accessToken, { rol: 'ADMINISTRADOR' });
    expect(ajeno.status).toBe(403);
  });
});

describe('sesiones', () => {
  it('renueva la sesión con la cookie y rota el token', async () => {
    const s = await c.login(admin.rut);
    const r1 = await c.req('POST', '/auth/renovar', undefined, {}, s.cookie);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTruthy();
    const nueva = (r1.headers['set-cookie']?.[0] ?? '').split(';')[0];
    expect(nueva).not.toBe(s.cookie);
    expect((await c.get('/auth/me', r1.body.accessToken)).status).toBe(200);
  });

  it('la cookie de renovación es httpOnly y de mismo sitio', async () => {
    const r = await c.post('/auth/login', undefined, { rut: admin.rut, password: PASSWORD });
    const cabecera = r.headers['set-cookie'][0];
    expect(cabecera).toMatch(/HttpOnly/i);
    expect(cabecera).toMatch(/SameSite=Strict/i);
    expect(cabecera).toMatch(/Path=\/api\/auth/);
  });

  it('reutilizar un token de renovación ya gastado revoca toda la sesión', async () => {
    const s = await c.login(admin.rut);
    const r1 = await c.req('POST', '/auth/renovar', undefined, {}, s.cookie);
    expect(r1.status).toBe(200);
    // Fuera de la gracia de dos pestañas simultáneas, el token viejo es señal de robo.
    await ds.query(`UPDATE sesiones SET ultimo_uso = (UTC_TIMESTAMP(6) - INTERVAL 2 MINUTE) WHERE usuario_id = ?`, [s.id]);
    const reuso = await c.req('POST', '/auth/renovar', undefined, {}, s.cookie);
    expect(reuso.status).toBe(401);
    expect((await c.get('/auth/me', r1.body.accessToken)).status).toBe(401);
  });

  it('dos pestañas que renuevan a la vez con el mismo token no pierden la sesión', async () => {
    const s = await c.login(admin.rut);
    const [a, b] = await Promise.all([c.req('POST', '/auth/renovar', undefined, {}, s.cookie), c.req('POST', '/auth/renovar', undefined, {}, s.cookie)]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it('cerrar sesión la revoca en el servidor: el token y la cookie dejan de servir', async () => {
    const s = await c.login(admin.rut);
    expect((await c.post('/auth/logout', s.token)).status).toBe(204);
    expect((await c.get('/auth/me', s.token)).status).toBe(401);
    expect((await c.req('POST', '/auth/renovar', undefined, {}, s.cookie)).status).toBe(401);
  });

  it('sin cookie no se puede renovar', async () => {
    expect((await c.post('/auth/renovar')).status).toBe(401);
  });

  it('un token manipulado o falso responde 401', async () => {
    const s = await c.login(admin.rut);
    const partes = s.token.split('.');
    expect((await c.get('/auth/me', `${partes[0]}.${partes[1]}.firmafalsa`)).status).toBe(401);
    expect((await c.get('/auth/me', 'no.es.un.token')).status).toBe(401);
    const sinFirma = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + partes[1] + '.';
    expect((await c.get('/auth/me', sinFirma)).status).toBe(401);
  });

  it('desactivar una cuenta corta el acceso de inmediato', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    expect((await c.get('/pacientes', p.token)).status).toBe(200);
    expect((await c.post(`/usuarios/${p.id}/desactivar`, admin.token)).status).toBe(200);
    expect((await c.get('/pacientes', p.token)).status).toBe(401);
    expect((await c.post('/auth/login', undefined, { rut: p.rut, password: PASSWORD })).status).toBe(401);
    expect((await c.post(`/usuarios/${p.id}/activar`, admin.token)).status).toBe(200);
    expect((await c.post('/auth/login', undefined, { rut: p.rut, password: PASSWORD })).status).toBe(200);
  });

  it('quitar un rol corta ese acceso aunque la sesión siga abierta', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA', 'MEDICO'], rol: 'MEDICO' });
    expect((await c.get('/medico/pacientes', p.token)).status).toBe(200);
    const r = await c.put(`/usuarios/${p.id}/roles`, admin.token, { roles: ['RECEPCIONISTA'] });
    expect(r.status).toBe(200);
    expect((await c.get('/medico/pacientes', p.token)).status).toBe(401);
  });

  it('cambiar la contraseña cierra las demás sesiones', async () => {
    const a = await c.login(admin.rut);
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    const otra = await c.login(p.rut);
    const cambio = await c.post('/auth/password', p.token, { actual: PASSWORD, nueva: 'Nueva2026xx' });
    expect(cambio.status).toBe(204);
    expect((await c.get('/auth/me', otra.token)).status).toBe(401);
    expect((await c.get('/auth/me', p.token)).status).toBe(200);
    expect((await c.post('/auth/login', undefined, { rut: p.rut, password: 'Nueva2026xx' })).status).toBe(200);
    expect(a.token).toBeTruthy();
  });

  it('cambiar la contraseña exige la actual', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    expect((await c.post('/auth/password', p.token, { actual: 'incorrecta1', nueva: 'Nueva2026xx' })).status).toBe(401);
    expect((await c.post('/auth/password', p.token, { actual: PASSWORD, nueva: 'corta' })).status).toBe(400);
  });
});

describe('activación de cuentas', () => {
  it('el código es de un solo uso', async () => {
    const rut = rutNuevo();
    const r = await c.post('/usuarios', admin.token, { rut, nombres: 'Uso', apellidoPaterno: 'Unico', roles: ['RECEPCIONISTA'] });
    expect(r.body.codigo).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect((await c.post('/auth/activar', undefined, { rut, codigo: r.body.codigo, password: PASSWORD })).status).toBe(200);
    expect((await c.post('/auth/activar', undefined, { rut, codigo: r.body.codigo, password: 'Otra2026xx' })).status).toBe(400);
  });

  it('un código vencido no sirve', async () => {
    const rut = rutNuevo();
    const r = await c.post('/usuarios', admin.token, { rut, nombres: 'Vence', apellidoPaterno: 'Pronto', roles: ['RECEPCIONISTA'] });
    await ds.query(`UPDATE codigos_acceso SET expira_en = (UTC_TIMESTAMP(6) - INTERVAL 1 HOUR) WHERE usuario_id = ?`, [r.body.usuario.id]);
    const a = await c.post('/auth/activar', undefined, { rut, codigo: r.body.codigo, password: PASSWORD });
    expect(a.status).toBe(400);
  });

  it('un código equivocado y un RUT inexistente dan el mismo mensaje', async () => {
    const rut = rutNuevo();
    await c.post('/usuarios', admin.token, { rut, nombres: 'Mensaje', apellidoPaterno: 'Igual', roles: ['RECEPCIONISTA'] });
    const a = await c.post('/auth/activar', undefined, { rut, codigo: 'AAAA-AAAA', password: PASSWORD });
    const b = await c.post('/auth/activar', undefined, { rut: rutNuevo(), codigo: 'AAAA-AAAA', password: PASSWORD });
    expect(a.body.message).toBe(b.body.message);
  });

  it('una cuenta sin activar no puede iniciar sesión', async () => {
    const rut = rutNuevo();
    await c.post('/usuarios', admin.token, { rut, nombres: 'Sin', apellidoPaterno: 'Activar', roles: ['RECEPCIONISTA'] });
    expect((await c.post('/auth/login', undefined, { rut, password: PASSWORD })).status).toBe(401);
  });

  it('el paciente debe aceptar el consentimiento al activar', async () => {
    const recepcion = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    const rut = rutNuevo();
    const r = await c.post('/pacientes', recepcion.token, { rut, nombres: 'Sin', apellidoPaterno: 'Consentimiento', fechaNacimiento: '1990-01-01', telefono: '+56 9 1111 2222' });
    expect(r.status).toBe(201);
    const sin = await c.post('/auth/activar', undefined, { rut, codigo: r.body.codigoActivacion, password: PASSWORD });
    expect(sin.status).toBe(400);
    expect(sin.body.message).toMatch(/consentimiento/);
    const con = await c.post('/auth/activar', undefined, { rut, codigo: r.body.codigoActivacion, password: PASSWORD, aceptaConsentimiento: true });
    expect(con.status).toBe(200);
    const [{ n }] = await ds.query('SELECT COUNT(*) AS n FROM consentimientos WHERE paciente_id = ?', [r.body.paciente.id]);
    expect(Number(n)).toBe(1);
  });

  it('exige una contraseña segura', async () => {
    const rut = rutNuevo();
    const r = await c.post('/usuarios', admin.token, { rut, nombres: 'Clave', apellidoPaterno: 'Debil', roles: ['RECEPCIONISTA'] });
    for (const mala of ['corta1', 'sololetras', '12345678']) {
      expect((await c.post('/auth/activar', undefined, { rut, codigo: r.body.codigo, password: mala })).status).toBe(400);
    }
  });
});

describe('administración de usuarios', () => {
  it('un RUT existente recibe los roles nuevos en vez de crear otra persona', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    const r = await c.post('/usuarios', admin.token, { rut: p.rut, nombres: 'Otra', apellidoPaterno: 'Vez', roles: ['PACIENTE'] });
    expect(r.status).toBe(201);
    expect(r.body.existente).toBe(true);
    expect(r.body.codigo).toBeNull();
    expect(r.body.usuario.roles.sort()).toEqual(['PACIENTE', 'RECEPCIONISTA']);
  });

  it('un administrador no puede quitarse su rol ni desactivarse, y siempre queda uno', async () => {
    expect((await c.put(`/usuarios/${admin.id}/roles`, admin.token, { roles: ['RECEPCIONISTA'] })).status).toBe(403);
    expect((await c.post(`/usuarios/${admin.id}/desactivar`, admin.token)).status).toBe(403);
    const otro = await c.crearPersonal(admin, { roles: ['ADMINISTRADOR'] });
    expect((await c.post(`/usuarios/${otro.id}/desactivar`, admin.token)).status).toBe(200);
    expect((await c.post(`/usuarios/${otro.id}/activar`, admin.token)).status).toBe(200);
  });

  it('asignar el rol médico exige el perfil profesional', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    expect((await c.put(`/usuarios/${p.id}/roles`, admin.token, { roles: ['MEDICO'] })).status).toBe(400);
    expect((await c.put(`/usuarios/${p.id}/roles`, admin.token, { roles: ['MEDICO'], perfilProfesional: { especialidadId: 1 } })).status).toBe(200);
  });

  it('emitir un código de recuperación cierra las sesiones del usuario', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    const r = await c.post(`/usuarios/${p.id}/codigo`, admin.token);
    expect(r.status).toBe(200);
    expect(r.body.tipo).toBe('RECUPERACION');
    expect((await c.get('/auth/me', p.token)).status).toBe(401);
    const a = await c.post('/auth/activar', undefined, { rut: p.rut, codigo: r.body.codigo, password: 'Recuperada2026' });
    expect(a.status).toBe(200);
  });

  it('el administrador nunca recibe una contraseña, y la lista no devuelve hashes', async () => {
    const r = await c.get('/usuarios?tamano=100', admin.token);
    expect(JSON.stringify(r.body)).not.toMatch(/password|hash/i);
  });

  it('el RUT no se puede cambiar', async () => {
    const p = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'] });
    expect((await c.patch(`/usuarios/${p.id}`, admin.token, { rut: rutNuevo() })).status).toBe(400);
  });
});
