import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type CanActivateFn, type UrlTree } from '@angular/router';
import { loginGuard, rolGuard, sesionGuard } from './guards';
import type { Rol } from './models';

const usuario = (rol: Rol | null) => ({ id: 1, nombre: 'Prueba', rut: '12.345.678-5', roles: rol ? [rol] : (['PACIENTE', 'MEDICO'] as Rol[]), rol, especialidad: null, debeCambiarPassword: false });

/** Ejecuta una guardia dentro del contexto de inyección, igual que el enrutador, y responde la renovación de sesión que ella pide. */
async function ejecutar(guardia: CanActivateFn, sesion: ReturnType<typeof usuario> | null): Promise<boolean | string> {
  const http = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  const resultado = TestBed.runInInjectionContext(() => guardia({} as never, {} as never)) as Promise<boolean | UrlTree>;
  const peticion = http.expectOne('/api/auth/renovar');
  if (sesion) peticion.flush({ accessToken: 'token', usuario: sesion });
  else peticion.flush({}, { status: 401, statusText: 'No autorizado' });
  const r = await resultado;
  return typeof r === 'boolean' ? r : router.serializeUrl(r);
}

describe('guardias de ruta', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));

  describe('rolGuard', () => {
    it('sin sesión lleva al inicio de sesión', async () => {
      expect(await ejecutar(rolGuard('MEDICO'), null)).toBe('/login');
    });

    it('con el rol correcto deja pasar', async () => {
      expect(await ejecutar(rolGuard('MEDICO'), usuario('MEDICO'))).toBe(true);
    });

    it('con otro rol lleva a la pantalla de su propio rol', async () => {
      expect(await ejecutar(rolGuard('ADMINISTRADOR'), usuario('PACIENTE'))).toBe('/paciente');
    });

    it('con varios roles y sin perfil elegido lleva a elegir perfil', async () => {
      expect(await ejecutar(rolGuard('MEDICO'), usuario(null))).toBe('/perfil');
    });
  });

  describe('sesionGuard', () => {
    // Antes fallaba con NG0203: pedía el Router después del primer `await`, cuando ya no hay contexto de inyección.
    it('sin sesión lleva al inicio de sesión sin errores de inyección', async () => {
      expect(await ejecutar(sesionGuard, null)).toBe('/login');
    });

    it('con sesión deja pasar', async () => {
      expect(await ejecutar(sesionGuard, usuario(null))).toBe(true);
    });
  });

  describe('loginGuard', () => {
    // Antes fallaba con NG0203 y dejaba la página en blanco al abrir «/» con la sesión iniciada.
    it('con sesión lleva a la pantalla del rol sin errores de inyección', async () => {
      expect(await ejecutar(loginGuard, usuario('RECEPCIONISTA'))).toBe('/recepcion');
    });

    it('con sesión y sin rol elegido lleva a elegir perfil', async () => {
      expect(await ejecutar(loginGuard, usuario(null))).toBe('/perfil');
    });

    it('sin sesión muestra el inicio de sesión', async () => {
      expect(await ejecutar(loginGuard, null)).toBe(true);
    });
  });
});
