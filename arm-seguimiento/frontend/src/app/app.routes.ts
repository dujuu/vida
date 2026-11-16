import type { Routes } from '@angular/router';
import { loginGuard, rolGuard, sesionGuard } from './core/guards';

/**
 * Rutas de la aplicación. Cada área (paciente, médico, recepción y administración) es un conjunto de rutas con carga
 * diferida: quien entra como paciente nunca descarga el código de las demás. Los guardias solo ordenan la navegación; el
 * servidor valida el rol en cada petición.
 */
export const routes: Routes = [
  { path: 'login', canActivate: [loginGuard], title: 'Iniciar sesión - Vida Norte', loadComponent: () => import('./login/login').then((m) => m.Login) },
  { path: 'activar', title: 'Activar cuenta - Vida Norte', loadComponent: () => import('./login/activar').then((m) => m.Activar) },
  { path: 'perfil', canActivate: [sesionGuard], title: 'Elegir perfil - Vida Norte', loadComponent: () => import('./login/elegir-perfil').then((m) => m.ElegirPerfil) },
  { path: 'paciente', canActivate: [rolGuard('PACIENTE')], loadChildren: () => import('./paciente/rutas').then((m) => m.RUTAS) },
  { path: 'medico', canActivate: [rolGuard('MEDICO')], loadChildren: () => import('./medico/rutas').then((m) => m.RUTAS) },
  { path: 'recepcion', canActivate: [rolGuard('RECEPCIONISTA')], loadChildren: () => import('./recepcion/rutas').then((m) => m.RUTAS) },
  { path: 'admin', canActivate: [rolGuard('ADMINISTRADOR')], loadChildren: () => import('./admin/rutas').then((m) => m.RUTAS) },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
