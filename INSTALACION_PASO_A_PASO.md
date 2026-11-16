# Instalación paso a paso en otro computador

Esta guía deja el sistema **funcionando en un computador nuevo**, sin saber programar. Siga los pasos en orden, sin saltarse ninguno. Si algo sale distinto a lo que dice la guía, vaya al [final (problemas frecuentes)](#problemas-frecuentes) antes de seguir.

- **Tiempo:** de 30 a 45 minutos, casi todo esperando descargas.
- **Qué necesita:** un computador con **Windows 10 u 11**, conexión a Internet, unos 3 GB libres en el disco y permiso de administrador para instalar programas. (Si el computador es Linux o Mac, vea [la nota del final](#si-el-computador-es-linux-o-mac).)
- **Cómo queda:** el sistema abre en `http://localhost:3000` con **datos de demostración** (personas ficticias). Para usarlo con pacientes reales, vea el [último apartado](#para-uso-real-y-no-demostración).

## Antes de empezar: cómo seguir esta guía

1. Los comandos están en recuadros oscuros. **Se escriben (o se pegan) tal cual**, sin cambiar nada, y se aprieta **Enter**. Para pegar en la ventana negra se usa clic derecho, o `Ctrl + V`. Si un recuadro trae varias líneas, se escribe **una línea por vez** (Enter después de cada una). Si una sola instrucción larga aparece partida en dos líneas en el papel, es solo por el ancho de la página: se escribe de corrido, todo junto.
2. Después de cada comando, **espere a que termine**: termina cuando vuelve a aparecer la línea con la carpeta y el cursor parpadeando. Algunos tardan varios minutos y parecen detenidos. Es normal.
3. Los textos entre `<` y `>` los reemplaza usted, y se borran los símbolos `<` y `>`. Por ejemplo, `<CLAVE_DB>` se cambia por la clave que usted eligió.
4. Use siempre la **ventana negra «Símbolo del sistema»** (se abre apretando la tecla Windows, escribiendo `cmd` y Enter). **No use «PowerShell»**: en algunos computadores bloquea los comandos de este proyecto.
5. Cada vez que termine de instalar un programa, **cierre la ventana negra y abra una nueva**. Si no, no reconoce el programa recién instalado.

### Anote estas dos claves ahora

Se las va a pedir la instalación más adelante. Escríbalas en un papel o en un archivo:

| Nombre | Para qué sirve | Su valor |
|---|---|---|
| `CLAVE_ROOT` | Es la clave maestra de la base de datos. La elige en el paso 1.3. | |
| `CLAVE_DB` | Es la clave que usa el sistema para entrar a la base. La elige en el paso 3. | |

Elija claves de **solo letras y números** (sin espacios, sin tildes ni la ñ, sin símbolos), de 10 caracteres o más. Por ejemplo: `Verano2026Norte`. Los símbolos como `%`, `&`, `^` o las comillas rompen los comandos de esta guía, y el comando del paso 4.1 no los acepta.

---

## Paso 1. Instalar tres programas

### 1.1. Node.js (hace funcionar el sistema)

1. Entre a **https://nodejs.org** y descargue el botón verde que dice **LTS**.
2. Abra el archivo descargado y apriete **Next** en todas las pantallas hasta **Install**. No cambie nada.
3. Cuando termine, **abra una ventana nueva** del Símbolo del sistema y escriba:

```
node -v
```

**Qué debe ver:** un número que empiece con `v22` o más, por ejemplo `v24.11.0`. Si dice un número más bajo (`v18`, `v20`), descargue de nuevo la versión LTS e instálela encima.

Compruebe también el segundo programa que viene con Node:

```
npm -v
```

**Qué debe ver:** un número, por ejemplo `10.9.2`.

**Si dice «no se reconoce como un comando»:** cierre la ventana negra, abra una nueva e intente otra vez. Si sigue igual, reinicie el computador.

### 1.2. Git (descarga el proyecto)

1. Entre a **https://git-scm.com/download/win**. La descarga empieza sola.
2. Abra el archivo y apriete **Next** en todas las pantallas hasta **Install**. No cambie nada.
3. **Abra una ventana nueva** del Símbolo del sistema y escriba:

```
git --version
```

**Qué debe ver:** `git version 2.` seguido de números.

### 1.3. MariaDB (guarda los datos)

1. Entre a **https://mariadb.org/download** y descargue **MariaDB Community Server**, versión **12** (la más reciente de la serie 12), para **Windows** en formato **MSI**.
2. Abra el archivo. Apriete **Next** hasta llegar a la pantalla que pide la clave:
   - En **New root password** y **Confirm**, escriba la clave que anotó como **`CLAVE_ROOT`**.
   - **Deje desmarcada** la casilla «Enable access from remote machines for root user».
   - **Deje marcada** la casilla «Use UTF8 as the default server's character set».
3. En la siguiente pantalla, deje marcado **«Install as service»** y el puerto **3306**. Siga con **Next** e **Install**.
4. Al terminar, MariaDB queda funcionando sola y se enciende cada vez que se prende el computador.

---

## Paso 2. Descargar el proyecto

Abra una ventana nueva del Símbolo del sistema. Vaya al disco `C:` y descargue el proyecto (son dos comandos, uno por línea):

```
cd C:\
git clone https://github.com/dujuu/vida.git
```

**Qué debe ver:** líneas que dicen `Cloning into 'vida'...` y terminan en `done.`. Se crea la carpeta `C:\vida`.

*(Se usa `C:\` a propósito: en la carpeta Documentos, Windows suele sincronizar con OneDrive, y eso hace lenta y frágil la instalación.)*

**Si pide usuario y contraseña de GitHub o abre una página para iniciar sesión:** el repositorio es privado. Inicie sesión con una cuenta de GitHub que tenga acceso al repositorio y vuelva a ejecutar el comando.

Entre a la carpeta del sistema:

```
cd vida\arm-seguimiento
```

---

## Paso 3. Crear la base de datos

Se hace una sola vez en cada computador.

1. Apriete la tecla Windows y escriba **MariaDB**. Entre a la carpeta **MariaDB 12.x (x64)** y abra **Command Prompt (MariaDB 12.x (x64))**. Se abre una ventana negra especial. *(El número exacto puede variar un poco según la versión que instaló.)*
2. Escriba este comando y apriete Enter:

```
mariadb -u root -p
```

3. Pide **Enter password**: escriba la `CLAVE_ROOT` y apriete Enter. **Al escribirla no se ve nada, ni puntitos. Es normal.**

**Qué debe ver:** un texto de bienvenida y una línea que empieza con `MariaDB [(none)]>`.

4. Ahora pegue estas **cuatro** líneas, **una por vez**, apretando Enter después de cada una. En la **segunda y la tercera**, cambie `<CLAVE_DB>` por la clave que eligió (déjela entre las comillas simples `'...'`, y borre los símbolos `<` y `>`):

```
CREATE DATABASE IF NOT EXISTS vida_norte CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```
CREATE USER IF NOT EXISTS 'arm_app'@'localhost' IDENTIFIED BY '<CLAVE_DB>';
```

```
CREATE USER IF NOT EXISTS 'arm_app'@'127.0.0.1' IDENTIFIED BY '<CLAVE_DB>';
```

```
GRANT ALL PRIVILEGES ON vida_norte.* TO 'arm_app'@'localhost', 'arm_app'@'127.0.0.1';
```

**Qué debe ver:** después de cada línea, `Query OK`. (En la segunda y tercera puede decir `Query OK, 0 rows affected`. Está bien.)

5. Para salir, escriba `exit` y apriete Enter. Cierre esa ventana negra especial y vuelva a la anterior (la del paso 2). Si la cerró, abra una nueva del Símbolo del sistema y escriba `cd C:\vida\arm-seguimiento`.

---

## Paso 4. Configurar el sistema

Entre a la carpeta `backend` y cree el archivo de configuración a partir de la plantilla:

```
cd backend
copy .env.example .env
```

**Qué debe ver:** `1 archivo(s) copiado(s).`

### 4.1. Poner la clave y el secreto (un solo comando)

Este comando escribe por usted en el archivo `.env` la clave de la base de datos y un secreto de seguridad que inventa solo. No hay que abrir ni editar nada a mano.

Escriba esto, cambiando `<CLAVE_DB>` por la clave que eligió en el paso 3 (y borrando los símbolos `<` y `>`):

```
node ..\scripts\configurar-env.cjs <CLAVE_DB>
```

Por ejemplo, si su clave es `Verano2026Norte`:

```
node ..\scripts\configurar-env.cjs Verano2026Norte
```

**Qué debe ver:** un texto que empieza con `Listo. El archivo .env quedó así:` y tres líneas:

```
  DB_PASS     = Verano2026Norte
  JWT_SECRET  = 58281b... (96 caracteres)
  MODO        = desarrollo
```

- `DB_PASS` debe mostrar **su** clave, igual a la del paso 3.
- `JWT_SECRET` debe decir `96 caracteres` (las letras y números de adelante serán otros).
- `MODO` debe decir `desarrollo`.

**Si dice `ERROR`:** el mensaje explica qué corregir (por ejemplo, que la clave tiene un símbolo o que falta el paso anterior). Corrija y vuelva a escribir el comando. Se puede repetir todas las veces que haga falta.

---

## Paso 5. Instalar y preparar el sistema

Todavía en la carpeta `backend`, escriba estos dos comandos, **uno por vez**, y espere a que cada uno termine:

```
npm install
```

*(Tarda de 2 a 5 minutos. Pueden aparecer líneas amarillas que dicen `npm warn` y un aviso de «vulnerabilities»: se ignoran.)*

```
npm run build
```

**Qué debe ver:** vuelve la línea de la carpeta sin ningún mensaje en rojo.

Ahora lo mismo para la parte visual. Primero cambie de carpeta:

```
cd ..\frontend
```

```
npm install
```

```
npm run build
```

*(Este último tarda de 1 a 4 minutos.)*

**Qué debe ver:** al final, una lista de archivos, la línea `Application bundle generation complete` y otra que empieza con `Output location:`. No debe haber nada en rojo que diga `ERROR`.

---

## Paso 6. Crear las tablas y cargar los datos de demostración

Vuelva a la carpeta `backend` y escriba, **uno por vez**:

```
cd ..\backend
```

```
npm run migration:run
```

**Qué debe ver:** muchísimas líneas que empiezan con `query:` (es normal, son las tablas que se van creando) y, al final, líneas como `Migration ... has been executed successfully`. Eso significa que creó las tablas. Tarda menos de un minuto.

```
npm run seed
```

**Qué debe ver:** una lista que empieza con `Usuarios de demostración (contraseña: Vida2026)` y muestra siete personas (administración, recepción, médicos y pacientes), sin errores en rojo.

---

## Paso 7. Encender el sistema

En la misma carpeta `backend`, escriba:

```
npm run start:prod
```

**Qué debe ver:** muchas líneas y, al final, `Nest application successfully started`. **No cierre esta ventana negra**: mientras esté abierta, el sistema funciona. Minimícela si le molesta.

Abra el navegador (Chrome, Edge o Firefox) y entre a:

**http://localhost:3000**

Debe aparecer la pantalla de inicio de sesión de **Vida Norte**.

### Cuentas de demostración

La contraseña de todas es **`Vida2026`**. Son personas ficticias.

| Rol | Nombre | RUT |
|---|---|---|
| Administración | Camila Rojas Vega | 11.222.333-9 |
| Médico | Dr. Rodrigo Salas | 12.345.678-5 |
| Médica | Dra. Paula Contreras | 14.567.890-0 |
| Paciente | Ana Muñoz | 16.789.012-1 |
| Paciente | Carlos Pérez | 18.234.567-9 |
| Paciente | Sofía Araya | 19.345.678-2 |
| Recepción y paciente | Daniela Pizarro Soto | 12.333.444-2 |

Daniela tiene dos perfiles: al entrar, el sistema le pregunta con cuál quiere actuar.

**Para apagar el sistema:** haga clic en la ventana negra y apriete `Ctrl + C`. Si pregunta «¿Desea terminar el trabajo por lotes?», escriba `S` y Enter.

---

## Las próximas veces: cómo encenderlo de nuevo

Los pasos 1 a 6 se hacen **una sola vez**. Después, para usar el sistema:

1. Abra el Símbolo del sistema.
2. Escriba estos dos comandos:

```
cd C:\vida\arm-seguimiento\backend
npm run start:prod
```

3. Espere el mensaje `Nest application successfully started` y entre a **http://localhost:3000**.

MariaDB se enciende sola con el computador, no hace falta hacer nada con ella.

---

## Entrar desde un celular u otro computador de la misma red

El computador donde instaló el sistema es el **servidor**. Debe estar encendido y con el sistema funcionando (paso 7).

1. **Busque la IP del servidor.** En el Símbolo del sistema del servidor escriba `ipconfig`. Busque la línea **Dirección IPv4** de su conexión (por ejemplo `192.168.1.50`).
2. **Permita la conexión.** La primera vez que se enciende el sistema, Windows muestra un aviso del cortafuegos. Marque **solo «Redes privadas»** y apriete **Permitir acceso**. Si el aviso no apareció o se cerró, abra el Símbolo del sistema **como administrador** (clic derecho sobre «Símbolo del sistema» → «Ejecutar como administrador») y pegue:

```
netsh advfirewall firewall add rule name="Vida Norte 3000" dir=in action=allow protocol=TCP localport=3000 profile=private
```

*(Es una sola línea, escrita de corrido. Debe terminar con `profile=private`.)*

3. **En el celular o el otro computador**, conectado a la **misma red wifi o cable**, abra el navegador y escriba `http://` seguido de la IP y `:3000`. Por ejemplo: **http://192.168.1.50:3000**.

Notas:

- Si la red wifi está marcada como «Pública» en Windows, el cortafuegos la bloquea. Cámbiela a «Privada» en Configuración → Red e Internet → propiedades de la red.
- La IP puede cambiar si se apaga el router. Para que no cambie, hay que fijarla (vea el apartado 6.2 de la [guía de puesta en marcha](GUIA_PUESTA_EN_MARCHA.md)).
- **No abra el puerto 3000 hacia Internet en el router.** Está pensado solo para la red interna.
- Con conexión `http://` (sin candado) el navegador no permite notificaciones del sistema. Los avisos se muestran dentro de la aplicación mientras está abierta.

---

## Problemas frecuentes

| Lo que pasa | Qué hacer |
|---|---|
| `'node' no se reconoce como un comando interno o externo` (o lo mismo con `npm` o `git`) | Cierre la ventana negra y abra una nueva. Si sigue, reinicie el computador. Si sigue, reinstale ese programa (paso 1). |
| `npm : No se puede cargar el archivo ... porque la ejecución de scripts está deshabilitada` | Está usando PowerShell. Cierre la ventana y use **Símbolo del sistema** (`cmd`). |
| `ER_ACCESS_DENIED_ERROR` al hacer `migration:run` o `start:prod` | La clave de `DB_PASS` en el archivo `.env` no es la misma `CLAVE_DB` del paso 3. Repita el comando del paso 4.1 con la misma clave que usó en el paso 3. |
| `Unknown database 'vida_norte'` | Falta crear la base de datos: repita el paso 3. |
| `ECONNREFUSED 127.0.0.1:3306` | MariaDB está apagada. Apriete la tecla Windows, escriba **Servicios**, ábralo, busque **MariaDB** (o **MySQL**), clic derecho → **Iniciar**. |
| `Configuración inválida` al encender | Falta o está mal una línea del `.env`. El mensaje dice cuál. Lo más común: `JWT_SECRET` sin pegar o con menos de 32 caracteres. |
| `EADDRINUSE` o «address already in use» | Otro programa (o una ventana negra anterior del sistema) ya usa el puerto 3000. Cierre las demás ventanas negras. Si persiste, cambie la línea `PORT=3000` del `.env` por `PORT=3001` y entre a `http://localhost:3001`. |
| El navegador muestra «No se puede acceder» o `localhost` no carga | La ventana del paso 7 se cerró o no terminó de encender. Revise que diga `Nest application successfully started`. |
| La página carga pero muestra un error 404 en vez de la pantalla de inicio | No se terminó el `npm run build` de la carpeta `frontend` (paso 5). Repítalo y vuelva a encender el sistema. |
| El RUT y la clave no funcionan | Revise que la clave sea `Vida2026` (con V mayúscula) y que haya ejecutado `npm run seed` (paso 6). |
| Desde el celular no abre | Revise que esté en la **misma red wifi**, que el sistema esté encendido y el cortafuegos permita el puerto 3000 (apartado anterior). |
| Un comando se queda «pegado» más de 10 minutos | Apriete `Ctrl + C`, revise su conexión a Internet y repita ese comando. |
| Salió un error que no está aquí | Copie el texto completo en rojo y compártalo con el equipo. No siga con los pasos siguientes. |

### Empezar de cero

Si algo quedó a medias y prefiere repetir, desde el Símbolo del sistema:

1. Apague el sistema (`Ctrl + C`).
2. Entre a **Command Prompt (MariaDB 12.x)** → `mariadb -u root -p` y ejecute `DROP DATABASE vida_norte;` seguido de `exit`.
3. Borre la carpeta `C:\vida`.
4. Vuelva al **paso 2**. *(Los programas del paso 1 no hay que reinstalarlos.)*

---

## Para uso real (y no demostración)

Esta guía instala el sistema con **datos de demostración** y en `MODO=desarrollo`, ideal para probarlo o presentarlo. Para usarlo con pacientes reales hay **tres diferencias**, explicadas en la [guía de puesta en marcha](GUIA_PUESTA_EN_MARCHA.md):

1. En el `.env`, `MODO=piloto`. En ese modo el comando `npm run seed` queda bloqueado a propósito, para no mezclar datos de prueba con datos reales.
2. En lugar del paso 6 con `seed`, se crea el administrador real con `npm run admin:crear` (pide RUT, nombre y contraseña por consola).
3. Hay que fijar la IP del servidor, hacer respaldos y definir el aviso de privacidad y la política de conservación de datos (secciones 6.2, 7 y 8 de la guía de puesta en marcha).

**Los datos de demostración y los reales no se mezclan nunca.** Si ya cargó el demo en una base y quiere pasar a uso real, cree otra base o empiece de cero con el apartado anterior.

---

## Si el computador es Linux o Mac

Los pasos son los mismos con estas diferencias:

- Se usa la **Terminal** en vez del Símbolo del sistema, y las carpetas se separan con `/` en lugar de `\` (por ejemplo `cd vida/arm-seguimiento/backend`).
- `copy .env.example .env` se escribe `cp .env.example .env`, y `node ..\scripts\configurar-env.cjs <CLAVE_DB>` se escribe `node ../scripts/configurar-env.cjs <CLAVE_DB>`.
- Node.js (versión 22 o superior), Git y MariaDB 12 se instalan con el gestor de paquetes del sistema o desde sus sitios oficiales. La base se crea abriendo `sudo mariadb` (en lugar del «Command Prompt» de MariaDB del paso 3) y pegando las mismas líneas de SQL.
- La guía técnica [GUIA_PUESTA_EN_MARCHA.md](GUIA_PUESTA_EN_MARCHA.md) trae los comandos para Linux (secciones 2 a 6), incluido cómo dejar el sistema encendido automáticamente con systemd.
