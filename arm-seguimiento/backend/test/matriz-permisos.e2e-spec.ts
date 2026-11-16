// @ts-nocheck
/**
 * Matriz de permisos automática: recorre TODAS las rutas del sistema con cada uno de los cuatro roles, sin sesión
 * y con un recurso ajeno. Lee los `@Roles` y `@Public` del propio código, de modo que una ruta nueva sin protección
 * hace fallar esta prueba. Es la prueba central de "cada rol ve y hace solo lo que le corresponde".
 */
import { MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Cliente, crearApp, escenario } from './ayuda.js';

const METODOS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const ROLES = ['PACIENTE', 'MEDICO', 'RECEPCIONISTA', 'ADMINISTRADOR'];
/** Rutas de autenticación: cerrar sesión o cambiar contraseña alteran la sesión de la propia prueba. */
const SALTAR = [/^\/auth\//];
/** Rutas del dominio clínico: ninguna puede quedar sin `@Roles`. */
const CLINICAS = [/^\/ficha/, /^\/atenciones/, /^\/antecedentes/, /^\/diagnosticos/, /^\/examenes/, /^\/documentos/, /^\/mi-ficha/, /^\/recomendaciones/, /^\/calendario/, /^\/eventos/, /^\/seguimiento/, /^\/dashboard/];

let app, c, sesiones, rutas;

function listarRutas(app) {
  const reflector = new Reflector();
  const escaner = new MetadataScanner();
  const salida = [];
  const controladores = [...app.container.getModules().values()].flatMap((m) => [...m.controllers.values()]);
  for (const w of controladores) {
    const clase = w.metatype;
    if (!clase) continue;
    const base = Reflect.getMetadata(PATH_METADATA, clase) ?? '';
    for (const nombre of escaner.getAllMethodNames(clase.prototype)) {
      const fn = clase.prototype[nombre];
      const metodo = Reflect.getMetadata(METHOD_METADATA, fn);
      if (metodo === undefined) continue;
      const ruta = Reflect.getMetadata(PATH_METADATA, fn);
      const completa = '/' + [base, ruta].filter((x) => x && x !== '/').join('/').replace(/\/+/g, '/').replace(/^\//, '');
      salida.push({
        metodo: METODOS[metodo] ?? 'GET',
        ruta: completa,
        publica: !!reflector.getAllAndOverride('isPublic', [fn, clase]),
        roles: reflector.getAllAndOverride('roles', [fn, clase]),
        nombre: `${clase.name}.${nombre}`,
      });
    }
  }
  return salida;
}

const concreta = (ruta) => ruta.replace(/:[a-zA-Z]+/g, '999999');

beforeAll(async () => {
  app = await crearApp();
  c = new Cliente(app);
  const e = await escenario(c);
  sesiones = { PACIENTE: e.paciente, MEDICO: e.medico, RECEPCIONISTA: e.recepcion, ADMINISTRADOR: e.admin };
  rutas = listarRutas(app).filter((r) => !SALTAR.some((s) => s.test(r.ruta)) && !r.publica);
});
afterAll(async () => app?.close());

describe('matriz de permisos', () => {
  it('descubre las rutas del sistema', () => expect(rutas.length).toBeGreaterThan(100));

  it('toda ruta clínica declara los roles que la pueden usar', () => {
    const sinRoles = rutas.filter((r) => CLINICAS.some((p) => p.test(r.ruta)) && (!r.roles || r.roles.length === 0));
    expect(sinRoles.map((r) => `${r.metodo} ${r.ruta}`)).toEqual([]);
  });

  it('ninguna ruta clínica admite recepción ni administración', () => {
    const mal = rutas.filter((r) => CLINICAS.some((p) => p.test(r.ruta)) && r.roles?.some((x) => x === 'RECEPCIONISTA' || x === 'ADMINISTRADOR'));
    // Excepción deliberada: el dashboard del centro es agregado y sin nombres.
    expect(mal.map((r) => `${r.metodo} ${r.ruta}`).filter((x) => !x.includes('/dashboard/centro'))).toEqual([]);
  });

  it('sin sesión, toda ruta protegida responde 401', async () => {
    const fallas = [];
    for (const r of rutas) {
      const res = await c.req(r.metodo, concreta(r.ruta), undefined, r.metodo === 'GET' ? undefined : {});
      if (res.status !== 401) fallas.push(`${r.metodo} ${r.ruta} -> ${res.status}`);
    }
    expect(fallas).toEqual([]);
  });

  for (const rol of ROLES) {
    it(`con el rol ${rol}: permitido solo donde corresponde (y nunca un error 500)`, async () => {
      const fallas = [];
      for (const r of rutas) {
        const res = await c.req(r.metodo, concreta(r.ruta), sesiones[rol].token, r.metodo === 'GET' ? undefined : {});
        const permitido = !r.roles || r.roles.length === 0 || r.roles.includes(rol);
        if (res.status >= 500) fallas.push(`${r.metodo} ${r.ruta} -> ${res.status} (error del servidor)`);
        else if (permitido && (res.status === 401 || (res.status === 403 && /permisos|perfil/.test(res.body?.message ?? '')))) fallas.push(`${r.metodo} ${r.ruta} debería permitir ${rol} -> ${res.status}`);
        else if (!permitido && res.status !== 403) fallas.push(`${r.metodo} ${r.ruta} debería denegar ${rol} -> ${res.status}`);
      }
      expect(fallas).toEqual([]);
    });
  }

  it('un recurso ajeno responde 404, no 403 ni 200 (no confirma que exista)', async () => {
    const otro = await c.crearPaciente(sesiones.RECEPCIONISTA, 'Otro');
    const res = await c.get(`/ficha/${otro.id}`, sesiones.MEDICO.token);
    expect(res.status).toBe(404);
    const res2 = await c.get(`/ficha/${sesiones.PACIENTE.id}`, sesiones.MEDICO.token);
    expect(res2.status).toBe(200);
  });
});
