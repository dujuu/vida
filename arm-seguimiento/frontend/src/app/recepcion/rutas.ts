import type { Routes } from '@angular/router';
import { Bandeja } from '../shared/bandeja';
import { Shell } from '../shared/shell';

/** Rutas del área de recepción: agenda del centro, pacientes (solo datos administrativos) y contactos. */
export const RUTAS: Routes = [
  {
    path: '',
    component: Shell,
    data: {
      area: 'Recepción',
      nav: [
        { ruta: '/recepcion/agenda', etiqueta: 'Agenda', icono: 'calendar_today' },
        { ruta: '/recepcion/pacientes', etiqueta: 'Pacientes', icono: 'groups' },
        { ruta: '/recepcion/contactos', etiqueta: 'Contactos', icono: 'forum' },
      ],
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'agenda' },
      { path: 'agenda', title: 'Agenda - Vida Norte', loadComponent: () => import('./agenda').then((m) => m.AgendaRecepcion) },
      { path: 'reservar', title: 'Nueva cita - Vida Norte', loadComponent: () => import('./reservar').then((m) => m.ReservarRecepcion) },
      { path: 'citas/:id/reprogramar', title: 'Reprogramar - Vida Norte', loadComponent: () => import('./reservar').then((m) => m.ReprogramarRecepcion) },
      { path: 'pacientes', title: 'Pacientes - Vida Norte', loadComponent: () => import('./pacientes').then((m) => m.PacientesRecepcion) },
      { path: 'pacientes/nuevo', title: 'Registrar paciente - Vida Norte', loadComponent: () => import('./pacientes').then((m) => m.PacienteNuevo) },
      { path: 'pacientes/:id', title: 'Paciente - Vida Norte', loadComponent: () => import('./pacientes').then((m) => m.PacienteDetalle) },
      { path: 'contactos', title: 'Contactos - Vida Norte', loadComponent: () => import('./contactos').then((m) => m.ContactosRecepcion) },
      { path: 'contactos/nuevo', title: 'Registrar contacto - Vida Norte', loadComponent: () => import('./contactos').then((m) => m.ContactoNuevo) },
      { path: 'notificaciones', title: 'Avisos - Vida Norte', component: Bandeja },
    ],
  },
];
