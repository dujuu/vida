import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { AREA_DE_ROL, type Rol } from './models';

/**
 * Deja pasar solo a quien tiene sesión y actúa con uno de los roles indicados. Es una comodidad de la interfaz: la
 * protección real está en el servidor, que valida el rol en cada petición.
 *
 * - Sin sesión: lleva al inicio de sesión.
 * - Con varios roles y sin perfil elegido: lleva a elegir perfil.
 * - Con otro rol: lleva a la pantalla de su propio rol.
 */
export const rolGuard =
  (...roles: Rol[]): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.iniciar();
    const u = auth.usuario();
    if (!u) return router.createUrlTree(['/login']);
    if (u.rol === null) return router.createUrlTree(['/perfil']);
    return roles.includes(u.rol) ? true : router.createUrlTree([AREA_DE_ROL[u.rol]]);
  };

/** Exige sesión (con cualquier rol, o sin rol elegido todavía). Se usa en la pantalla de elegir perfil. */
export const sesionGuard: CanActivateFn = async () => {
  // `inject` solo funciona antes del primer `await`: por eso se piden las dependencias primero.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.iniciar();
  return auth.usuario() ? true : router.createUrlTree(['/login']);
};

/** Quien ya tiene sesión no necesita ver el inicio de sesión: se le lleva a su pantalla. */
export const loginGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.iniciar();
  const u = auth.usuario();
  return u ? router.createUrlTree([auth.rutaInicio(u.rol)]) : true;
};
