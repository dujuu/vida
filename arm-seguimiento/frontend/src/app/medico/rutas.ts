import type { Routes } from '@angular/router';
import { Bandeja } from '../shared/bandeja';
import { Shell } from '../shared/shell';

/** Rutas del área del médico: agenda del día, pacientes y su ficha clínica, seguimiento de la continuidad y disponibilidad. */
export const RUTAS: Routes = [
  {
    path: '',
    component: Shell,
    data: {
      area: 'Médico',
      nav: [
        { ruta: '/medico/agenda', etiqueta: 'Agenda', icono: 'calendar_today' },
        { ruta: '/medico/pacientes', etiqueta: 'Pacientes', icono: 'groups' },
        { ruta: '/medico/seguimiento', etiqueta: 'Seguimiento', icono: 'monitoring' },
        { ruta: '/medico/disponibilidad', etiqueta: 'Disponibilidad', icono: 'event_available' },
      ],
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'agenda' },
      { path: 'agenda', title: 'Mi agenda - Vida Norte', loadComponent: () => import('./agenda').then((m) => m.AgendaMedico) },
      { path: 'pacientes', title: 'Mis pacientes - Vida Norte', loadComponent: () => import('./pacientes').then((m) => m.PacientesMedico) },
      { path: 'pacientes/:id', title: 'Ficha del paciente - Vida Norte', loadComponent: () => import('./ficha').then((m) => m.FichaPaciente) },
      { path: 'pacientes/:id/imprimir', title: 'Ficha para imprimir - Vida Norte', loadComponent: () => import('./ficha').then((m) => m.FichaImprimirMedico) },
      { path: 'pacientes/:id/indicar', title: 'Nueva indicación - Vida Norte', loadComponent: () => import('./indicar').then((m) => m.Indicar) },
      { path: 'atencion/nueva', title: 'Nueva atención - Vida Norte', loadComponent: () => import('./atencion').then((m) => m.AtencionNueva) },
      { path: 'atencion/:id', title: 'Atención - Vida Norte', loadComponent: () => import('./atencion').then((m) => m.AtencionEditor) },
      { path: 'indicaciones/:id', title: 'Indicación - Vida Norte', loadComponent: () => import('./indicacion').then((m) => m.IndicacionDetalle) },
      { path: 'indicaciones/:id/pauta', title: 'Modificar la pauta - Vida Norte', data: { modificar: true }, loadComponent: () => import('./indicar').then((m) => m.Indicar) },
      { path: 'seguimiento', title: 'Seguimiento - Vida Norte', loadComponent: () => import('./seguimiento').then((m) => m.SeguimientoMedico) },
      { path: 'disponibilidad', title: 'Disponibilidad - Vida Norte', loadComponent: () => import('./disponibilidad').then((m) => m.Disponibilidad) },
      { path: 'notificaciones', title: 'Avisos - Vida Norte', component: Bandeja },
    ],
  },
];
