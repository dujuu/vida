# Guía de puesta en marcha

Cómo dejar el sistema funcionando en el centro: **un solo computador** (el servidor) con MariaDB y la aplicación, y todos los demás equipos y teléfonos entrando por el navegador a una dirección de la red del centro. No hay aplicación móvil que instalar, ni servicios en la nube: la carpeta del proyecto y su base de datos son el sistema completo.

La guía tiene dos caminos:

- **Instalar en el servidor del centro** (secciones 1 a 8): para usarlo de verdad.
- **Trabajar en el código** (sección 9): para desarrollar y probar en un computador personal.

## 1. Cómo funciona

```
 teléfono / computador del centro ──(navegador, red local)──▶  http://192.168.1.50:3000
                                                                       │
                                            Servidor del centro        ▼
                                     ┌──────────────────────────────────────────────┐
                                     │ NestJS: entrega la web y la API (puerto 3000)│
                                     │ MariaDB (solo accesible desde el servidor)   │
                                     │ carpeta de documentos + carpeta de respaldos │
                                     └──────────────────────────────────────────────┘
```

- La web y la API salen del mismo servidor y la misma dirección: no hay CORS ni configuración por dispositivo.
- La base de datos **no se expone a la red**: solo la aplicación del servidor la usa.
- La conexión dentro de la red del centro es HTTP. Eso implica que el navegador **no permite notificaciones del sistema** con la aplicación cerrada: los avisos y recordatorios se muestran dentro de la aplicación mientras está abierta (se revisan cada 30 segundos). Está explicado a los usuarios en la pantalla de avisos.

## 2. Requisitos del servidor

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22 o superior | ejecutar el sistema (y compilarlo la primera vez) |
| MariaDB | 12 (la versión con la que se probó) | base de datos |
| Git | cualquiera reciente | descargar el proyecto |
| Una dirección IP fija en la red del centro | | que los dispositivos siempre encuentren el servidor |

El computador debe quedar **encendido en horario de atención**, conectado por cable de red si es posible, y con un disco con espacio para los documentos y los respaldos.

## 3. Descargar e instalar

```bash
git clone https://github.com/dujuu/maurosalud.git
cd maurosalud/arm-seguimiento
```

### 3.1. Crear la base de datos (una sola vez)

Elija una clave para el usuario de la base de datos y reemplace `<CLAVE_DB>`. Con MariaDB en ejecución:

```bash
# Linux
sudo mariadb
# Windows o macOS
mysql -u root -p
```

Dentro del cliente:

```sql
CREATE DATABASE IF NOT EXISTS vida_norte CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'arm_app'@'localhost' IDENTIFIED BY '<CLAVE_DB>';
GRANT ALL PRIVILEGES ON vida_norte.* TO 'arm_app'@'localhost';
FLUSH PRIVILEGES;
```

Las tablas no se crean a mano: las crean las migraciones del paso 5.

**Que la base de datos no se vea desde la red:** en el archivo de configuración de MariaDB (por ejemplo `/etc/mysql/mariadb.conf.d/50-server.cnf`) deje `bind-address = 127.0.0.1` y reinicie el servicio.

### 3.2. Configurar el sistema

El archivo `backend/.env` **no está en el repositorio** (tiene secretos). Se crea desde la plantilla:

```bash
cd backend
cp .env.example .env        # en Windows: copy .env.example .env
```

Edite `backend/.env`. Lo que **sí o sí** hay que cambiar para uso real:

| Variable | Valor |
|---|---|
| `DB_USER`, `DB_PASS`, `DB_NAME` | los del paso 3.1 |
| `JWT_SECRET` | un texto aleatorio de al menos 32 caracteres (comando abajo) |
| `MODO` | **`piloto`** (uso real: sin datos de demostración, sin Swagger, cabeceras estrictas) |
| `ARCHIVOS_DIR` | carpeta de los documentos de las fichas, **fuera** de la web, por ejemplo `/var/lib/vida-norte/archivos` |
| `RESPALDOS_DIR` | carpeta de los respaldos, por ejemplo `/var/lib/vida-norte/respaldos` |

Generar un `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Si `JWT_SECRET` falta o es corto, o `MODO` no es válido, el servidor **no arranca** y dice cuál variable corregir. En `MODO=piloto` el script de datos de demostración (`npm run seed`) está bloqueado a propósito, para no mezclar datos de prueba con datos reales.

## 4. Compilar

Desde `arm-seguimiento`:

```bash
cd backend  && npm install && npm run build
cd ../frontend && npm install && npm run build
```

La web compilada queda en `frontend/dist/frontend/browser` y el backend la encuentra solo (se puede indicar otra carpeta con `WEB_DIR`).

## 5. Crear las tablas y el primer administrador

Desde `arm-seguimiento/backend`:

```bash
npm run migration:run     # crea las tablas, el catálogo de especialidades, los feriados y los parámetros iniciales
npm run admin:crear       # pide RUT, nombre y contraseña del primer administrador por consola
```

La contraseña del administrador se escribe por consola y no queda en ningún archivo. Con ese administrador se entra al sistema y, desde **Administración → Usuarios**, se crean los médicos, la recepción y demás personal; cada persona recibe un **código de activación** (válido 48 horas, de un solo uso) con el que elige su propia contraseña. El código se entrega en persona: el administrador nunca conoce las contraseñas.

`npm run admin:crear` sirve también para recuperar el acceso si se pierde el único administrador.

## 6. Levantar el sistema

Desde `arm-seguimiento/backend`:

```bash
npm run start:prod        # equivale a: node dist/main
```

Abra `http://localhost:3000` en el servidor para comprobar que carga el inicio de sesión. Desde otro equipo de la red: `http://<IP-DEL-SERVIDOR>:3000` (por ejemplo `http://192.168.1.50:3000`).

### 6.1. Que arranque solo (Linux, systemd)

Cree `/etc/systemd/system/vida-norte.service` (ajuste las rutas y el usuario):

```ini
[Unit]
Description=Vida Norte - seguimiento de tratamientos
After=network.target mariadb.service

[Service]
User=vidanorte
WorkingDirectory=/opt/maurosalud/arm-seguimiento/backend
ExecStart=/usr/bin/node dist/main
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vida-norte
sudo journalctl -u vida-norte -f     # ver lo que va registrando
```

En Windows se puede dejar como tarea programada «al iniciar el equipo» que ejecute `node dist\main` en la carpeta `backend`.

### 6.2. Que los teléfonos y computadores lo encuentren

1. Fije la IP del servidor en el router (reserva DHCP) o en el propio equipo. Si la IP cambia, la dirección que los usuarios tienen guardada deja de funcionar.
2. Permita el puerto **3000** entrante en el cortafuegos del servidor, **solo desde la red local**. Ejemplo con `ufw`: `sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp`.
3. No abra ese puerto hacia Internet en el router. El sistema está pensado para la red interna del centro.
4. En los teléfonos, abra la dirección en el navegador y use «Agregar a la pantalla de inicio» para tener un ícono.

## 7. Respaldos

Los datos de salud son lo más valioso del sistema. El script `scripts/respaldo.sh` deja en `RESPALDOS_DIR` un volcado de la base de datos (con sus reglas de auditoría) y una copia de los documentos adjuntos, y borra los de más de 14 días:

```bash
scripts/respaldo.sh
```

Prográmelo todos los días (Linux, `crontab -e`):

```
30 2 * * *  /opt/maurosalud/arm-seguimiento/scripts/respaldo.sh >> /var/log/vida-norte-respaldo.log 2>&1
```

El panel **Administración → Resumen** muestra la fecha del último respaldo y avisa si tiene más de 2 días.

**Un respaldo que está solo en el mismo computador no protege de una falla del disco.** Copie la carpeta de respaldos a un disco externo o a otro equipo de la red, al menos una vez por semana, y guárdelo con la misma reserva que la ficha clínica.

**Restaurar** (en un servidor nuevo o tras una falla): crear la base y el usuario como en el paso 3.1, y luego

```bash
gunzip -c db-AAAAMMDD-HHMM.sql.gz | mariadb -u arm_app -p vida_norte
tar -xzf archivos-AAAAMMDD-HHMM.tar.gz -C <carpeta padre de ARCHIVOS_DIR>
```

Pruebe una restauración completa en un equipo aparte **antes** de necesitarla.

## 8. Operación y seguridad

- **Actualizar el sistema:** `git pull`, luego `npm install`, `npm run build` (en `backend` y `frontend`), `npm run migration:run` y reiniciar el servicio. Haga un respaldo antes.
- **Quién ve qué:** el paciente ve solo lo suyo; el médico, solo a los pacientes con los que tiene relación de atención; recepción y administración **nunca ven información clínica**. Cada acceso a una ficha queda en la auditoría, que nadie puede modificar ni borrar (lo impide la propia base de datos), y el paciente puede ver quién abrió su ficha.
- **Códigos de activación y recuperación:** quien tiene un código puede fijar una contraseña nueva para esa cuenta. Por eso se entregan solo en persona, verificando la identidad, y cada emisión queda en la auditoría. Revise esa lista de vez en cuando.
- **Contraseñas:** mínimo 8 caracteres con letras y números; 5 intentos fallidos por RUT bloquean la cuenta 15 minutos. Los parámetros se ajustan en **Administración → Parámetros**.
- **Mensajes a pacientes:** el envío por WhatsApp y correo es una **simulación**: se guarda lo que se habría enviado, pero no sale ningún mensaje real.
- **Datos de las tomas:** son un autorreporte del paciente; el sistema no las trata como prueba de que tomó el medicamento.
- **Antes de usar datos reales** el centro debe definir su base legal y el aviso de privacidad (Ley 19.628 sobre protección de la vida privada, Ley 20.584 sobre derechos y deberes de los pacientes y la nueva Ley 21.719 de protección de datos personales): el consentimiento que se muestra al activar la cuenta es texto de referencia, y debe revisarlo quien corresponda.

## 9. Trabajar en el código (desarrollo)

En un computador personal, con MariaDB en ejecución y la base creada como en el paso 3.1. Con `MODO=desarrollo` (el valor de la plantilla):

```bash
cd backend
npm install
npm run migration:run
npm run seed              # datos de demostración (se puede repetir; npm run seed:reset los deja como nuevos)
npm run start:dev         # API en http://localhost:3000/api  ·  Swagger en http://localhost:3000/api/docs
```

En otra terminal:

```bash
cd frontend
npm install
npm start                 # interfaz en http://localhost:4200 (envía /api al backend con proxy.conf.json)
```

### Cuentas de demostración

La contraseña de todas es `Vida2026`. Son datos ficticios.

| Rol | Nombre | RUT |
|---|---|---|
| Administración | Camila Rojas Vega | 11.222.333-9 |
| Recepción y paciente | Daniela Pizarro Soto | 12.333.444-2 |
| Médico (Medicina General) | Dr. Rodrigo Salas | 12.345.678-5 |
| Médica (Kinesiología) | Dra. Paula Contreras | 14.567.890-0 |
| Paciente | Ana Muñoz | 16.789.012-1 |
| Paciente | Carlos Pérez | 18.234.567-9 |
| Paciente | Sofía Araya | 19.345.678-2 |

Daniela tiene dos perfiles (recepción y paciente): al entrar, el sistema pregunta con cuál quiere actuar. La **Clave Única** del inicio de sesión es una simulación que usa las mismas cuentas.

### Pruebas

| Comando | Qué prueba |
|---|---|
| `backend`: `npm test` | pruebas unitarias: reglas de agenda, generación de tomas, continuidad, fechas y zona horaria, seguridad, ficha |
| `backend`: `npm run test:e2e` | pruebas de extremo a extremo contra el servidor compilado y una base real: permisos de cada ruta por rol, 20 reservas simultáneas de la misma hora (gana solo una), sesiones, ficha clínica, indicaciones |
| `frontend`: `npm test` | pruebas unitarias: sesión, interceptor, guardias de ruta, fechas, RUT, validadores |

Las pruebas de extremo a extremo **borran los datos** de la base en que corren, por eso exigen una base aparte cuyo nombre termine en `_test`:

```sql
CREATE DATABASE vida_norte_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON vida_norte_test.* TO 'arm_app'@'localhost';
```

Las pruebas leen la conexión del entorno (no del archivo `.env`), así que se cargan las variables y se cambia el nombre de la base solo para esa corrida:

```bash
cd backend
set -a; source .env; set +a                  # Linux o macOS: carga DB_HOST, DB_USER, DB_PASS...
DB_NAME=vida_norte_test npm run test:e2e
```

### Otros comandos de `backend`

| Comando | Qué hace |
|---|---|
| `npm run migration:show` | Muestra qué migraciones están aplicadas |
| `npm run migration:revert` | Deshace la última migración |
| `npm run docs` | Genera la documentación del código (TypeDoc) |

## 10. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El servidor no arranca y dice «Configuración inválida» | Falta o está mal una variable de `backend/.env`; el mensaje dice cuál |
| `ER_ACCESS_DENIED_ERROR` | `DB_USER` o `DB_PASS` no coinciden con los del paso 3.1 |
| `Unknown database 'vida_norte'` | Falta crear la base de datos (paso 3.1) |
| `ECONNREFUSED 127.0.0.1:3306` | MariaDB no está en ejecución. En Linux: `sudo systemctl start mariadb` |
| `EADDRINUSE` en el puerto 3000 | Otro programa usa el puerto. Cambie `PORT` en el `.env` |
| Desde el teléfono no abre la dirección | El teléfono no está en la misma red wifi, la IP del servidor cambió, o el cortafuegos bloquea el puerto 3000 |
| `http://localhost:3000` responde 404 en `/` | No se compiló el frontend (paso 4) o `WEB_DIR` apunta a una carpeta sin `index.html` |
| La sesión se cierra sola | Es normal tras 12 h (personal) o 30 días (pacientes) sin uso; los plazos están en Administración → Parámetros |
| `npm run seed` dice que está bloqueado | Es a propósito en `MODO=piloto`. Use `MODO=desarrollo` solo en un computador de pruebas |
| Un comando de `npm` falla por la versión | Use Node.js 22 o superior (`node --version`) |

## 11. Qué no subir nunca al repositorio

`backend/.env`, los respaldos, la carpeta de documentos de las fichas y cualquier archivo con claves o datos de pacientes. El `.gitignore` ya excluye `.env`; si necesita compartir una configuración, comparta `.env.example`, que no tiene secretos.
