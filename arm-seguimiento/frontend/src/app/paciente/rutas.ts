import type { Routes } from '@angular/router';
import { Bandeja } from '../shared/bandeja';
import { Shell } from '../shared/shell';

/** Rutas del área del paciente: navegación pensada para el teléfono (Hoy, Calendario, Horas, Indicaciones, Más). */
export const RUTAS: Routes = [
  {
    path: '',
    component: Shell,
    data: {
      area: 'Paciente',
      nav: [
        { ruta: '/paciente/hoy', etiqueta: 'Hoy', icono: 'today' },
        { ruta: '/paciente/calendario', etiqueta: 'Calendario', icono: 'calendar_month' },
        { ruta: '/paciente/horas', etiqueta: 'Horas', icono: 'event_available' },
        { ruta: '/paciente/indicaciones', etiqueta: 'Indicaciones', icono: 'sticky_note_2' },
        { ruta: '/paciente/mas', etiqueta: 'Más', icono: 'menu', avisos: true },
      ],
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'hoy' },
      { path: 'hoy', title: 'Hoy - Vida Norte', loadComponent: () => import('./hoy').then((m) => m.Hoy) },
      { path: 'calendario', title: 'Calendario - Vida Norte', loadComponent: () => import('./calendario').then((m) => m.CalendarioPaciente) },
      { path: 'horas', title: 'Mis horas - Vida Norte', loadComponent: () => import('./horas').then((m) => m.Horas) },
      { path: 'horas/reservar', title: 'Reservar una hora - Vida Norte', loadComponent: () => import('./horas').then((m) => m.Reservar) },
      { path: 'horas/:id/reprogramar', title: 'Cambiar la hora - Vida Norte', loadComponent: () => import('./horas').then((m) => m.Reprogramar) },
      { path: 'indicaciones', title: 'Mis indicaciones - Vida Norte', loadComponent: () => import('./indicaciones').then((m) => m.Indicaciones) },
      { path: 'indicaciones/:id', title: 'Indicación - Vida Norte', loadComponent: () => import('./indicaciones').then((m) => m.IndicacionDetalle) },
      { path: 'mas', title: 'Más - Vida Norte', loadComponent: () => import('./mas').then((m) => m.Mas) },
      { path: 'ficha', title: 'Mi ficha - Vida Norte', loadComponent: () => import('./ficha').then((m) => m.MiFichaPantalla) },
      { path: 'ficha/imprimir', title: 'Mi ficha - Vida Norte', loadComponent: () => import('./ficha').then((m) => m.MiFichaImprimir) },
      { path: 'perfil', title: 'Mi perfil - Vida Norte', loadComponent: () => import('./mas').then((m) => m.PerfilPaciente) },
      { path: 'medicos', title: 'Mis médicos - Vida Norte', loadComponent: () => import('./mas').then((m) => m.MisMedicos) },
      { path: 'notificaciones', title: 'Avisos - Vida Norte', component: Bandeja },
    ],
  },
];
