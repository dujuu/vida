# Backend

API del sistema (NestJS 12, TypeORM 1.1, MariaDB). Todas las rutas viven bajo `/api`. En `MODO=piloto` el mismo servidor entrega también la web compilada del frontend.

La puesta en marcha, las variables de entorno y los respaldos están en la [guía de puesta en marcha](../../GUIA_PUESTA_EN_MARCHA.md); la visión general, en el [README del proyecto](../README.md).

## Estructura

```
src/
├── main.ts              arranque: prefijo /api, validación, helmet, web compilada, Swagger (solo en desarrollo)
├── app.module.ts
├── common/              RUT, fechas y zona horaria, paginación, entorno, limitador, filtro de errores
├── database/            configuración, migraciones, seed de demostración, crear-admin
├── auth/                M1  acceso, sesiones, códigos, guardias (JwtAuthGuard, RolesGuard)
├── usuarios/            M2
├── profesionales/       M3
├── pacientes/           M4
├── asignaciones/        M5  relación médico–paciente y AccesoClinicoService
├── agenda/              M6
├── citas/               M7
├── contactos/           M8
├── ficha/               M9
├── recomendaciones/     M10
├── calendario/          M11 generación de las tomas (función pura en generador.ts)
├── notificaciones/      M12
├── seguimiento/         M13 continuidad (función pura en continuidad.ts)
├── auditoria/           M14
├── configuracion/       M15
└── tareas/              tareas periódicas (recordatorios, cierre de indicaciones vencidas, limpieza)
test/                    pruebas de extremo a extremo
```

Cada módulo tiene sus entidades, DTO, servicio y controlador. La lógica con reglas (agenda, generación de tomas, continuidad, fechas) está en **funciones puras** con pruebas unitarias.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | API con recarga automática |
| `npm run build` / `npm run start:prod` | compilar / ejecutar `dist/main` |
| `npm run migration:run` · `migration:show` · `migration:revert` | migraciones (el esquema solo cambia así) |
| `npm run seed` · `seed:reset` | datos de demostración (bloqueado en `MODO=piloto`) |
| `npm run admin:crear` | crea el primer administrador por consola |
| `npm test` | pruebas unitarias |
| `npm run test:e2e` | pruebas de extremo a extremo; exigen una base cuyo nombre termine en `_test` (borran sus datos) |
| `npm run docs` | documentación del código (TypeDoc) |

## Reglas que conviene no romper

- Toda ruta declara sus roles con `@Roles(...)` (o `@Public()`); la matriz de permisos de las pruebas e2e falla si una ruta clínica admite recepción o administración.
- El acceso clínico se decide **solo** en `AccesoClinicoService`: no repetir esa lógica en otros servicios.
- Las horas se guardan en UTC; la conversión desde y hacia la hora del centro vive solo en `common/fechas.util.ts`.
- La auditoría nunca guarda contenido clínico, solo la acción y el recurso afectado.
- Un `synchronize` activo está prohibido: cualquier cambio de esquema es una migración nueva.
