// @ts-nocheck
/**
 * Arnés de las pruebas de integración: levanta la aplicación compilada y ofrece un cliente HTTP con sesiones y
 * funciones para crear personas de cada rol a través de la propia API (así las pruebas ejercitan los flujos reales).
 */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

export const PASSWORD = 'Prueba2026x';
export const ADMIN_RUT = '10000001-' + dv(10000001);

function dv(cuerpo: number): string {
  let suma = 0;
  let mult = 2;
  for (const d of String(cuerpo).split('').reverse()) {
    suma += Number(d) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

let contador = 20_000_000 + Math.floor(Math.random() * 5_000_000);
/** RUT válido que no se repite dentro de la corrida. */
export function rutNuevo(): string {
  contador += 7;
  return `${contador}-${dv(contador)}`;
}

/** Levanta la aplicación igual que `main.ts` (prefijo, validación, filtro de errores). */
export async function crearApp() {
  process.env.TAREAS = 'off';
  process.env.LIMITE_PETICIONES = '1000000';
  process.env.ARCHIVOS_DIR = process.env.ARCHIVOS_DIR ?? './archivos-prueba';
  const { AppModule } = await import('../dist/app.module.js');
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  return app;
}

export interface Sesion {
  id: number;
  rut: string;
  token: string;
  cookie: string;
  usuario: any;
}

/** Cliente HTTP de pruebas. */
export class Cliente {
  constructor(public app: any) {}

  req(metodo: string, ruta: string, token?: string, cuerpo?: unknown, cookie?: string) {
    let r = request(this.app.getHttpServer())[metodo.toLowerCase()]('/api' + ruta);
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    if (cookie) r = r.set('Cookie', cookie);
    return cuerpo === undefined ? r : r.send(cuerpo);
  }

  get = (ruta: string, token?: string) => this.req('GET', ruta, token);
  post = (ruta: string, token?: string, cuerpo: unknown = {}) => this.req('POST', ruta, token, cuerpo);
  put = (ruta: string, token?: string, cuerpo: unknown = {}) => this.req('PUT', ruta, token, cuerpo);
  patch = (ruta: string, token?: string, cuerpo: unknown = {}) => this.req('PATCH', ruta, token, cuerpo);
  delete = (ruta: string, token?: string) => this.req('DELETE', ruta, token);

  /** Inicia sesión; si la persona tiene varios roles, elige el indicado. */
  async login(rut: string, rol?: string, password = PASSWORD): Promise<Sesion> {
    const r = await this.post('/auth/login', undefined, { rut, password });
    if (r.status !== 200) throw new Error(`Login falló (${r.status}): ${JSON.stringify(r.body)}`);
    let { accessToken, usuario } = r.body;
    const cookie = (r.headers['set-cookie']?.[0] ?? '').split(';')[0];
    if (rol) {
      const e = await this.post('/auth/rol', accessToken, { rol });
      if (e.status !== 200) throw new Error(`Elegir rol falló (${e.status}): ${JSON.stringify(e.body)}`);
      accessToken = e.body.accessToken;
      usuario = e.body.usuario;
    }
    return { id: usuario.id, rut, token: accessToken, cookie, usuario };
  }

  /** Crea personal desde el administrador y completa la activación de la cuenta. */
  async crearPersonal(admin: Sesion, datos: { roles: string[]; nombres?: string; apellido?: string; especialidadId?: number; rol?: string }): Promise<Sesion> {
    const rut = rutNuevo();
    const cuerpo: any = { rut, nombres: datos.nombres ?? 'Persona', apellidoPaterno: datos.apellido ?? 'Prueba', roles: datos.roles };
    if (datos.roles.includes('MEDICO')) cuerpo.perfilProfesional = { especialidadId: datos.especialidadId ?? 1, duracionCitaMin: 30 };
    const r = await this.post('/usuarios', admin.token, cuerpo);
    if (r.status !== 201) throw new Error(`Crear personal falló (${r.status}): ${JSON.stringify(r.body)}`);
    const a = await this.post('/auth/activar', undefined, { rut, codigo: r.body.codigo, password: PASSWORD, aceptaConsentimiento: true });
    if (a.status !== 200) throw new Error(`Activar falló (${a.status}): ${JSON.stringify(a.body)}`);
    return this.login(rut, datos.rol ?? (datos.roles.length === 1 ? undefined : datos.roles[0]));
  }

  /** Registra un paciente por recepción y lo activa. */
  async crearPaciente(recepcion: Sesion, nombres = 'Paciente'): Promise<Sesion> {
    const rut = rutNuevo();
    const r = await this.post('/pacientes', recepcion.token, { rut, nombres, apellidoPaterno: 'Prueba', fechaNacimiento: '1990-05-20', telefono: '+56 9 1234 5678', consentimientoPresencial: true });
    if (r.status !== 201) throw new Error(`Registrar paciente falló (${r.status}): ${JSON.stringify(r.body)}`);
    const a = await this.post('/auth/activar', undefined, { rut, codigo: r.body.codigoActivacion, password: PASSWORD });
    if (a.status !== 200) throw new Error(`Activar paciente falló (${a.status}): ${JSON.stringify(a.body)}`);
    return this.login(rut);
  }

  /** Carga un horario de lunes a viernes de 09:00 a 13:00 para un médico. */
  async cargarHorario(admin: Sesion, medicoId: number): Promise<void> {
    const { hoyLocal } = await import('../dist/common/fechas.util.js');
    const bloques = [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, horaInicio: '09:00', horaFin: '13:00' }));
    const r = await this.put(`/agenda/${medicoId}/bloques`, admin.token, { desde: hoyLocal(), bloques });
    if (r.status !== 200) throw new Error(`Horario falló (${r.status}): ${JSON.stringify(r.body)}`);
  }

  /** Horas libres de un médico en los próximos días, de la más cercana a la más lejana. */
  async horasLibres(token: string, medicoId: number, dias = 14): Promise<Array<{ inicio: string; fin: string; hora: string }>> {
    const { hoyLocal, sumarDias } = await import('../dist/common/fechas.util.js');
    const r = await this.get(`/agenda/${medicoId}/horas-libres?desde=${sumarDias(hoyLocal(), 2)}&hasta=${sumarDias(hoyLocal(), dias)}`, token);
    if (r.status !== 200) throw new Error(`Horas libres falló (${r.status}): ${JSON.stringify(r.body)}`);
    return r.body.flatMap((d: any) => d.horas);
  }
}

/** Escenario habitual: administrador, médico, recepcionista y un paciente con relación con el médico. */
export async function escenario(c: Cliente) {
  const admin = await c.login(ADMIN_RUT);
  const medico = await c.crearPersonal(admin, { roles: ['MEDICO'], nombres: 'Mario', apellido: 'Medico' });
  const medico2 = await c.crearPersonal(admin, { roles: ['MEDICO'], nombres: 'Marta', apellido: 'Medica' });
  const recepcion = await c.crearPersonal(admin, { roles: ['RECEPCIONISTA'], nombres: 'Rita', apellido: 'Recepcion' });
  await c.cargarHorario(admin, medico.id);
  await c.cargarHorario(admin, medico2.id);
  const paciente = await c.crearPaciente(recepcion, 'Paula');
  const horas = await c.horasLibres(recepcion.token, medico.id);
  const r = await c.post('/citas', recepcion.token, { medicoId: medico.id, pacienteId: paciente.id, inicio: horas[0].inicio });
  if (r.status !== 201) throw new Error(`Cita inicial falló (${r.status}): ${JSON.stringify(r.body)}`);
  return { admin, medico, medico2, recepcion, paciente, cita: r.body };
}
