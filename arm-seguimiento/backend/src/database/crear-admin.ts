/**
 * Crea el primer administrador del sistema, pidiendo los datos por consola. La contraseña no queda en el código
 * ni en el repositorio. Sirve también para recuperar el acceso cuando no queda ningún administrador activo.
 *
 * Variables opcionales para no interactuar (por ejemplo, en una instalación automatizada):
 * `ADMIN_RUT`, `ADMIN_NOMBRES`, `ADMIN_APELLIDO` y `ADMIN_PASSWORD`.
 *
 * Uso: `npm run admin:crear`.
 */
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { validarPassword } from '../auth/seguridad.util.js';
import { normalizarRut } from '../common/rut.util.js';
import dataSource from './data-source.js';

/** Lee una línea de la consola. Con `oculto`, no muestra lo que se escribe. */
async function preguntar(rl: ReturnType<typeof createInterface>, texto: string, oculto = false): Promise<string> {
  if (!oculto || !stdin.isTTY) return (await rl.question(texto)).trim();
  stdout.write(texto);
  const original = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => undefined;
  const respuesta = await rl.question('');
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = original;
  stdout.write('\n');
  return respuesta;
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const rutEntrada = process.env.ADMIN_RUT ?? (await preguntar(rl, 'RUT del administrador: '));
    const rut = normalizarRut(rutEntrada);
    if (!rut) throw new Error('El RUT ingresado no es válido');
    const nombres = process.env.ADMIN_NOMBRES ?? (await preguntar(rl, 'Nombres: '));
    const apellido = process.env.ADMIN_APELLIDO ?? (await preguntar(rl, 'Apellido paterno: '));
    if (nombres.length < 2 || apellido.length < 2) throw new Error('Ingrese nombres y apellido paterno');
    const password = process.env.ADMIN_PASSWORD ?? (await preguntar(rl, 'Contraseña (mínimo 8 caracteres, con letras y números): ', true));
    const error = validarPassword(password, rut);
    if (error) throw new Error(error);

    await dataSource.initialize();
    const hash = await bcrypt.hash(password, 10);
    const [existente] = await dataSource.query('SELECT id FROM usuarios WHERE rut = ?', [rut]);
    let id: number;
    if (existente) {
      id = existente.id;
      await dataSource.query('UPDATE usuarios SET password_hash = ?, activo = 1, debe_cambiar_password = 0 WHERE id = ?', [hash, id]);
      console.log('La persona ya existía: se actualizó su contraseña y se agregó el rol de administrador.');
    } else {
      const r = await dataSource.query('INSERT INTO usuarios (rut, nombres, apellido_paterno, password_hash, activo) VALUES (?, ?, ?, ?, 1)', [rut, nombres, apellido, hash]);
      id = r.insertId;
    }
    await dataSource.query(`INSERT IGNORE INTO usuario_rol (usuario_id, rol) VALUES (?, 'ADMINISTRADOR')`, [id]);
    await dataSource.query(`INSERT INTO auditoria (accion, recurso, recurso_id, detalle) VALUES ('USUARIO_CREAR', 'usuario', ?, 'administrador creado por consola')`, [String(id)]);
    console.log(`\nAdministrador listo: ${rut}. Ya puede iniciar sesión.`);
  } finally {
    rl.close();
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
