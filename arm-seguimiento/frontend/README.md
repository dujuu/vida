# Frontend

Una sola aplicación Angular 22 (componentes independientes, *signals* y Angular Material 3) para los cuatro roles. Es responsive: el paciente la usa sobre todo en el teléfono (navegación inferior) y el personal en el computador (navegación lateral). Cada rol es un conjunto de rutas con carga diferida: quien entra como paciente no descarga el código de las demás áreas.

La puesta en marcha está en la [guía de puesta en marcha](../../GUIA_PUESTA_EN_MARCHA.md); la visión general, en el [README del proyecto](../README.md).

## Estructura

```
src/app/
├── core/        sesión (token en memoria), cliente de la API, interceptor, guardias de ruta, fechas, RUT, modelos
├── shared/      piezas comunes: estructura de pantalla (Shell), calendario, selector de hora, bandeja de avisos, buscador de pacientes
├── login/       inicio de sesión, activación de cuenta, elección de perfil
├── paciente/    Hoy, Calendario, Horas, Indicaciones, Más, Mi ficha
├── medico/      Agenda, Pacientes y ficha clínica, Atención, Indicar, Seguimiento, Disponibilidad
├── recepcion/   Agenda del centro, Pacientes, Reservar, Contactos
└── admin/       Resumen, Usuarios, Profesionales, Auditoría, Parámetros
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | servidor de desarrollo en http://localhost:4200; `/api` va al backend por `proxy.conf.json` |
| `npm run build` | versión de producción en `dist/frontend/browser` (la entrega el backend) |
| `npm test` | pruebas unitarias (Vitest) |
| `npm run docs` | documentación del código (TypeDoc) |

## Criterios de diseño

- **Un estado nunca se comunica solo con color:** cada estado lleva su texto.
- **Los errores de un campo aparecen solo después de tocarlo** (`core/error-campo.ts`).
- **Las fechas** se muestran en la hora del centro (America/Santiago) con las funciones de `core/fechas.ts`, sin depender de la zona del dispositivo.
- **El token de acceso vive solo en memoria.** Las guardias de ruta son una comodidad de la interfaz: la protección real está en el servidor.
- En guardias asíncronas, **`inject()` se pide antes del primer `await`** (después ya no hay contexto de inyección; hay pruebas que lo cubren).
