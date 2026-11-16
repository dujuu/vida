# Pruebas de calidad

La batería de pruebas hostiles de la API que estaba aquí (`api_hostil.py`) se hizo para la primera versión del sistema (dos roles y rutas `/doctor/...`) y quedó obsoleta.

Hoy la misma función la cumplen las **pruebas de extremo a extremo** de `backend/test/`, que corren contra la aplicación compilada y una base MariaDB real:

| Archivo | Qué comprueba |
|---|---|
| `matriz-permisos.e2e-spec.ts` | cada ruta de la API con cada rol: solo responde a quien corresponde, sin sesión todas dan 401, un recurso ajeno da 404 y ninguna termina en 500 |
| `reservas.e2e-spec.ts` | 20 reservas simultáneas de la misma hora: gana una y las otras 19 reciben 409 |
| `sesiones.e2e-spec.ts` | renovación rotativa, reutilización de una cookie vieja, bloqueo por intentos, cierre de sesión |
| `ficha.e2e-spec.ts` | atención inmutable, enmiendas, documentos con verificación de huella, acceso con relación cerrada |
| `tratamientos.e2e-spec.ts` | indicaciones con pauta, versiones, generación y marcado de tomas |

Para ejecutarlas, ver «Pruebas» en la [guía de puesta en marcha](../../GUIA_PUESTA_EN_MARCHA.md). El archivo anterior sigue en el historial de git por si se quiere consultar.
