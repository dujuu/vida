import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

const usuario = { id: 1, nombre: 'Prueba', rut: '12.345.678-5', roles: ['PACIENTE'], rol: 'PACIENTE', especialidad: null, debeCambiarPassword: false };
const respuesta = (token: string) => ({ accessToken: token, usuario });
/** Deja correr las promesas pendientes (la renovación de sesión es una promesa). */
const esperar = () => new Promise<void>((r) => setTimeout(r, 0));

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => ctrl.verify());

  /** Inicia sesión y deja el token «t1» en memoria. */
  async function conSesion(): Promise<void> {
    const login = new Promise<void>((resolve) => auth.login('12345678-5', 'x').subscribe(() => resolve()));
    ctrl.expectOne('/api/auth/login').flush(respuesta('t1'));
    await login;
  }

  it('agrega el token a las peticiones de la API', async () => {
    await conSesion();
    http.get('/api/citas/mias').subscribe();
    const r = ctrl.expectOne('/api/citas/mias');
    expect(r.request.headers.get('Authorization')).toBe('Bearer t1');
    r.flush([]);
  });

  it('no manda el token al inicio de sesión', () => {
    http.post('/api/auth/login', {}).subscribe();
    const r = ctrl.expectOne('/api/auth/login');
    expect(r.request.headers.has('Authorization')).toBe(false);
    r.flush(respuesta('x'));
  });

  it('si el token venció, renueva la sesión una vez y repite la petición con el token nuevo', async () => {
    await conSesion();
    let datos: unknown;
    http.get('/api/citas/mias').subscribe((d) => (datos = d));
    ctrl.expectOne('/api/citas/mias').flush({}, { status: 401, statusText: 'No autorizado' });
    ctrl.expectOne('/api/auth/renovar').flush(respuesta('t2'));
    await esperar();
    const repetida = ctrl.expectOne('/api/citas/mias');
    expect(repetida.request.headers.get('Authorization')).toBe('Bearer t2');
    repetida.flush(['cita']);
    expect(datos).toEqual(['cita']);
  });

  it('varias peticiones vencidas a la vez comparten una sola renovación', async () => {
    await conSesion();
    http.get('/api/a').subscribe();
    http.get('/api/b').subscribe();
    ctrl.expectOne('/api/a').flush({}, { status: 401, statusText: 'No autorizado' });
    ctrl.expectOne('/api/b').flush({}, { status: 401, statusText: 'No autorizado' });
    ctrl.expectOne('/api/auth/renovar').flush(respuesta('t2'));
    await esperar();
    ctrl.expectOne('/api/a').flush({});
    ctrl.expectOne('/api/b').flush({});
  });

  it('si la renovación falla, cierra la sesión local y devuelve el error', async () => {
    await conSesion();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    let error: unknown;
    http.get('/api/citas/mias').subscribe({ error: (e) => (error = e) });
    ctrl.expectOne('/api/citas/mias').flush({}, { status: 401, statusText: 'No autorizado' });
    ctrl.expectOne('/api/auth/renovar').flush({}, { status: 401, statusText: 'No autorizado' });
    await esperar();
    expect(error).toBeTruthy();
    expect(auth.usuario()).toBeNull();
    expect(auth.token()).toBeNull();
    expect(navegar).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });

  it('un 401 del inicio de sesión no intenta renovar', () => {
    let error: unknown;
    http.post('/api/auth/login', {}).subscribe({ error: (e) => (error = e) });
    ctrl.expectOne('/api/auth/login').flush({ message: 'Credenciales inválidas' }, { status: 401, statusText: 'No autorizado' });
    expect(error).toBeTruthy();
    ctrl.expectNone('/api/auth/renovar');
  });
});
