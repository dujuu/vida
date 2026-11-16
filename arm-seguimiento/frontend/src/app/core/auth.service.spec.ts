import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';

const usuario = { id: 7, nombre: 'Ana', rut: '16.789.012-1', roles: ['PACIENTE'], rol: 'PACIENTE', especialidad: null, debeCambiarPassword: false };

describe('AuthService', () => {
  let auth: AuthService;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('al iniciar recupera la sesión con la cookie de renovación', async () => {
    const listo = auth.iniciar();
    ctrl.expectOne('/api/auth/renovar').flush({ accessToken: 'abc', usuario });
    await listo;
    expect(auth.usuario()?.nombre).toBe('Ana');
    expect(auth.token()).toBe('abc');
  });

  it('si no hay sesión, queda sin usuario y sin token', async () => {
    const listo = auth.iniciar();
    ctrl.expectOne('/api/auth/renovar').flush({}, { status: 401, statusText: 'No autorizado' });
    await listo;
    expect(auth.usuario()).toBeNull();
    expect(auth.token()).toBeNull();
  });

  it('iniciar solo renueva una vez aunque se llame varias veces', async () => {
    const a = auth.iniciar();
    const b = auth.iniciar();
    ctrl.expectOne('/api/auth/renovar').flush({ accessToken: 'abc', usuario });
    await Promise.all([a, b]);
  });

  it('el token no se guarda en el almacenamiento del navegador', async () => {
    const listo = auth.iniciar();
    ctrl.expectOne('/api/auth/renovar').flush({ accessToken: 'secreto-123', usuario });
    await listo;
    expect(JSON.stringify({ ...localStorage })).not.toContain('secreto-123');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secreto-123');
  });

  it('la Clave Única simulada usa su propia ruta', () => {
    auth.login('16789012-1', 'x', true).subscribe();
    ctrl.expectOne('/api/auth/clave-unica-simulada').flush({ accessToken: 't', usuario });
  });

  it('cada rol tiene su pantalla de inicio y sin rol se elige perfil', () => {
    expect(auth.rutaInicio('PACIENTE')).toBe('/paciente');
    expect(auth.rutaInicio('MEDICO')).toBe('/medico');
    expect(auth.rutaInicio('RECEPCIONISTA')).toBe('/recepcion');
    expect(auth.rutaInicio('ADMINISTRADOR')).toBe('/admin');
    expect(auth.rutaInicio(null)).toBe('/perfil');
  });
});
