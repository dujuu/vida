import type { Routes } from '@angular/router';
import { Bandeja } from '../shared/bandeja';
import { Shell } from '../shared/shell';

/** Rutas del área de administración: resumen del centro, usuarios, profesionales, auditoría y parámetros. */
export const RUTAS: Routes = [
  {
    path: '',
    component: Shell,
    data: {
      area: 'Administración',
      nav: [
        { ruta: '/admin/resumen', etiqueta: 'Resumen', icono: 'monitoring' },
        { ruta: '/admin/usuarios', etiqueta: 'Usuarios', icono: 'manage_accounts' },
        { ruta: '/admin/profesionales', etiqueta: 'Profesionales', icono: 'stethoscope' },
        { ruta: '/admin/auditoria', etiqueta: 'Auditoría', icono: 'fact_check' },
        { ruta: '/admin/parametros', etiqueta: 'Parámetros', icono: 'tune' },
      ],
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      { path: 'resumen', title: 'Resumen - Vida Norte', loadComponent: () => import('./resumen').then((m) => m.ResumenAdmin) },
      { path: 'usuarios', title: 'Usuarios - Vida Norte', loadComponent: () => import('./usuarios').then((m) => m.UsuariosAdmin) },
      { path: 'usuarios/nuevo', title: 'Nuevo usuario - Vida Norte', loadComponent: () => import('./usuarios').then((m) => m.UsuarioNuevo) },
      { path: 'usuarios/:id', title: 'Usuario - Vida Norte', loadComponent: () => import('./usuarios').then((m) => m.UsuarioDetalle) },
      { path: 'profesionales', title: 'Profesionales - Vida Norte', loadComponent: () => import('./profesionales').then((m) => m.ProfesionalesAdmin) },
      { path: 'profesionales/:id/agenda', title: 'Agenda del médico - Vida Norte', loadComponent: () => import('../medico/disponibilidad').then((m) => m.Disponibilidad) },
      { path: 'catalogos', title: 'Especialidades y feriados - Vida Norte', loadComponent: () => import('./profesionales').then((m) => m.CatalogosAdmin) },
      { path: 'duplicados', title: 'Pacientes duplicados - Vida Norte', loadComponent: () => import('./duplicados').then((m) => m.DuplicadosAdmin) },
      { path: 'auditoria', title: 'Auditoría - Vida Norte', loadComponent: () => import('./auditoria').then((m) => m.AuditoriaAdmin) },
      { path: 'parametros', title: 'Parámetros - Vida Norte', loadComponent: () => import('./parametros').then((m) => m.ParametrosAdmin) },
      { path: 'notificaciones', title: 'Avisos - Vida Norte', component: Bandeja },
    ],
  },
];
