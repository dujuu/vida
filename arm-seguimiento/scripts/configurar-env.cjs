// Prepara backend/.env en una instalación nueva: pone la clave de la base de datos y genera el JWT_SECRET.
// Lo usa la guía INSTALACION_PASO_A_PASO.md (paso 4). No necesita instalar nada: solo Node.js.
//
// Uso (desde la carpeta backend):   node ..\scripts\configurar-env.cjs <CLAVE_DB>
//
// - Solo cambia las líneas DB_PASS y JWT_SECRET; el resto del archivo queda igual.
// - Se puede repetir las veces que haga falta (cada vez genera un secreto nuevo).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const archivo = path.join(__dirname, '..', 'backend', '.env');
const clave = process.argv[2];

function terminar(mensaje) {
  console.error('\nERROR: ' + mensaje + '\n');
  process.exit(1);
}

if (!clave) {
  terminar('Falta la clave de la base de datos. Escriba el comando así:\n  node ..\\scripts\\configurar-env.cjs MiClave2026Norte\n(cambie MiClave2026Norte por la clave que eligió en el paso 3)');
}
if (!/^[A-Za-z0-9]{8,}$/.test(clave)) {
  terminar('La clave debe tener al menos 8 caracteres y solo letras (sin tildes ni ñ) y números, sin espacios ni símbolos.');
}
if (!fs.existsSync(archivo)) {
  terminar('No existe el archivo ' + archivo + '\nPrimero cree el archivo con:  copy .env.example .env  (estando en la carpeta backend)');
}

let texto = fs.readFileSync(archivo, 'utf8');
const secreto = crypto.randomBytes(48).toString('hex');

for (const variable of ['DB_PASS', 'JWT_SECRET']) {
  if (!new RegExp('^' + variable + '=', 'm').test(texto)) {
    terminar('El archivo .env no tiene la línea ' + variable + '=. Vuelva a crearlo desde la plantilla (copy .env.example .env).');
  }
}

texto = texto
  .replace(/^DB_PASS=.*/m, () => 'DB_PASS=' + clave)
  .replace(/^JWT_SECRET=.*/m, () => 'JWT_SECRET=' + secreto);
fs.writeFileSync(archivo, texto);

const modo = (texto.match(/^MODO=(.*)$/m) || [, '(sin definir)'])[1].trim();
console.log('\nListo. El archivo .env quedó así:');
console.log('  DB_PASS     = ' + clave);
console.log('  JWT_SECRET  = ' + secreto.slice(0, 6) + '... (' + secreto.length + ' caracteres)');
console.log('  MODO        = ' + modo + '\n');
