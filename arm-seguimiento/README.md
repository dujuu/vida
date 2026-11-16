# Sistema de seguimiento y fidelización de tratamientos

Centro Médico Vida Norte SpA · Equipo ARM Systems · IP Santo Tomás (Arica)

Plataforma web (responsive, sin aplicación móvil ni servicios en la nube) para que el centro agende horas, lleve la ficha clínica, indique tratamientos con calendario de tomas y vea qué pacientes siguen o abandonan su tratamiento. Se instala en **un computador del centro** y se usa desde el navegador de cualquier equipo o teléfono de la red.

Instalación en el centro y operación: [guía de puesta en marcha](../GUIA_PUESTA_EN_MARCHA.md).

## Los cuatro roles

| Rol | Qué hace | Qué no ve |
|---|---|---|
| **Paciente** | Ve sus tomas del día, marca «Tomada» o «No la tomé», reserva y cambia sus horas, lee sus indicaciones, ve su ficha y quién la ha abierto | Lo de otros pacientes; las notas internas del médico |
| **Médico** | Agenda del día con sala de espera, ficha clínica completa de sus pacientes, atenciones con autoguardado, indicaciones con pauta horaria, seguimiento de la continuidad, su disponibilidad | Pacientes con los que no tiene relación de atención |
| **Recepción** | Agenda del centro, registro de pacientes, reservas y reprogramaciones, contactos (llamadas, mensajes, mesón), códigos de activación | **Nada clínico** |
| **Administración** | Usuarios y roles, profesionales y especialidades, feriados, parámetros, auditoría, resumen del centro, fusión de fichas duplicadas | **Nada clínico**; el resumen solo muestra cifras agregadas |

Una persona puede tener más de un rol (por ejemplo, recepcionista y paciente); en cada sesión actúa con uno solo y puede cambiar de perfil.

## Módulos

| # | Módulo | Resumen |
|---|---|---|
| M1 | Acceso | RUT y contraseña, activación con código de un solo uso, Clave Única simulada, renovación de sesión rotativa, bloqueo por intentos |
| M2 | Usuarios | Alta, roles, activación y desactivación, emisión de códigos |
| M3 | Profesionales | Especialidades, perfil del médico, duración de las citas |
| M4 | Pacientes | Registro por recepción, detección de duplicados y fusión |
| M5 | Asignaciones | Relación médico–paciente y la regla única de acceso clínico |
| M6 | Agenda | Horario semanal, bloqueos, feriados, horas libres |
| M7 | Citas | Reservar, cancelar, reprogramar, llegada, atención, inasistencia; **sin doble reserva** |
| M8 | Contactos | Formulario único de contacto, advertencias, envío simulado, pendientes |
| M9 | Ficha clínica | Antecedentes, atenciones inmutables con enmiendas, signos vitales, diagnósticos, exámenes, documentos |
| M10 | Indicaciones | Medicamento, rutina u otra indicación, con versiones y pauta horaria |
| M11 | Calendario | Genera las tomas de cada pauta; el paciente las marca |
| M12 | Avisos | Bandeja y recordatorios dentro de la aplicación |
| M13 | Seguimiento | Continuidad del paciente: al día, en riesgo, desertor, cerrado |
| M14 | Auditoría | Registro inalterable de accesos y cambios, sin contenido clínico |
| M15 | Configuración | Parámetros con validación de rango y auditoría |

## Tecnología

| Capa | Herramienta |
|---|---|
| Base de datos | MariaDB 12 |
| Backend | NestJS 12, TypeORM 1.1, JWT, bcryptjs, helmet, class-validator, Swagger (solo en desarrollo) |
| Frontend | Angular 22 (componentes independientes y *signals*), Angular Material 22 (Material 3), Chart.js con ng2-charts |
| Tipografías | Atkinson Hyperlegible Next (texto), Montserrat (solo el logo), Material Symbols (íconos) |
| Lenguaje | TypeScript 6 |
| Pruebas | Vitest (unitarias y de extremo a extremo) |

El servidor entrega la web compilada y la API (`/api`) desde el mismo puerto, de modo que no hay CORS ni direcciones distintas por dispositivo.

## Cómo está resuelto lo importante

- **Una sola regla de acceso clínico.** Un único servicio decide si alguien puede leer o escribir en una ficha: el paciente, la suya; el médico, solo con una relación de atención vigente (si se cierra, ve únicamente lo que él escribió); recepción y administración, nunca. Una ruta sin permiso responde 403; un recurso ajeno, 404.
- **Sin doble reserva.** Restricciones únicas en la base de datos impiden que el médico o el paciente tengan dos citas a la misma hora. La prueba de extremo a extremo lanza 20 reservas simultáneas de la misma hora: gana una y las otras 19 reciben 409.
- **Ficha inmutable.** Una atención cerrada no se edita: se agregan enmiendas con motivo y el texto original sigue visible. Un diagnóstico erróneo se descarta y se crea otro. Los documentos se guardan fuera de la web, con huella SHA-256 que se verifica al descargar.
- **Indicaciones con historial.** Cambiar una pauta crea una versión nueva, conserva lo ya registrado y reemplaza solo las tomas futuras pendientes. El sistema **nunca propone** dosis, frecuencias ni duraciones: las escribe el médico, y antes de emitir ve las tomas exactas que se generarán.
- **Tomas como autorreporte.** Lo que marca el paciente se rotula como autorreporte; una toma sin registro se muestra aparte y nunca se cuenta como omitida.
- **Sesión.** El token de acceso (15 minutos) vive solo en memoria; la sesión se mantiene con una cookie `httpOnly` de renovación que cambia en cada uso y se guarda cifrada en la base. Reutilizar una cookie vieja cierra la sesión.
- **Auditoría inalterable.** La base de datos impide modificar o borrar sus filas. No guarda contenido clínico; el paciente ve quién abrió su ficha.
- **Fechas.** Todo se guarda en UTC y se muestra en la hora del centro (America/Santiago), sin depender de la zona del teléfono.
- **Resumen del centro con privacidad.** Un grupo de menos de 5 personas se muestra como «menos de 5».

## Estructura

```
arm-seguimiento/
├── backend/     NestJS: una carpeta por módulo (entidades, DTO, servicio, controlador)
│   ├── src/database/migrations/   el esquema solo cambia con migraciones (synchronize está desactivado)
│   └── test/                      pruebas de extremo a extremo
├── frontend/    Angular: core/ (sesión, API, fechas), shared/ (piezas comunes), y una carpeta por rol
├── scripts/     respaldo.sh (base de datos y documentos)
└── docs/        diagramas, código documentado y presentaciones
```

## Puesta en marcha para desarrollar

```bash
cd backend  && cp .env.example .env     # completar DB_PASS y JWT_SECRET
npm install && npm run migration:run && npm run seed && npm run start:dev    # http://localhost:3000
cd ../frontend && npm install && npm start                                    # http://localhost:4200
```

Los detalles (base de datos, instalación para uso real, respaldos y cuentas de demostración) están en la [guía de puesta en marcha](../GUIA_PUESTA_EN_MARCHA.md).

## Pruebas

```bash
cd backend  && npm test                  # unitarias
cd backend  && npm run test:e2e          # extremo a extremo (base aparte terminada en _test; ver la guía)
cd frontend && npm test                  # unitarias
```

Las pruebas de extremo a extremo incluyen una **matriz de permisos** que recorre cada ruta de la API con cada rol y comprueba que solo responda a quien corresponde, que sin sesión todas respondan 401, que un recurso ajeno responda 404 y que ninguna ruta termine en un error 500.

## Documentación

- **API interactiva (Swagger / OpenAPI):** con `MODO=desarrollo`, en http://localhost:3000/api/docs (botón *Authorize* con el token del login). No se publica en `MODO=piloto`.
- **Código (TSDoc):** los archivos llevan comentarios `/** ... */` en español. `npm run docs` en `backend` y en `frontend` genera el sitio de referencia en `docs/codigo/`.
- **Flujos, diagramas de secuencia y casos de uso:** `docs/`.

## Alcance y límites conocidos

- Los mensajes por **WhatsApp y correo son una simulación**: se registra lo que se habría enviado, pero no sale nada.
- La **Clave Única es simulada**: usa las mismas cuentas del sistema.
- Dentro de la red del centro la conexión es **HTTP**: el navegador no permite notificaciones con la aplicación cerrada, por lo que los recordatorios son dentro de la aplicación.
- Las citas duran lo que indica el perfil de cada médico (30 minutos por defecto).
- Un administrador o recepcionista puede emitir códigos de activación o recuperación, lo que permitiría a quien los reciba fijar una contraseña. Queda auditado y se mitiga entregando el código solo en persona; conviene revisar esa lista periódicamente.
- Antes de usar datos reales, el centro debe definir su base legal, el aviso de privacidad y la política de conservación de la ficha.

## Logo

`frontend/public/logo-vida-norte.svg` es el logo vectorial oficial. La aplicación lo dibuja en línea (`shared/logo.ts`) para usar Montserrat; en ese componente los tamaños de las dos primeras líneas se ajustaron para que el texto no se salga del dibujo.
