// @ts-nocheck
/**
 * Preparación global de las pruebas de integración: deja la base de pruebas vacía, con todas las migraciones
 * aplicadas y con un administrador para empezar. Se niega a correr contra una base que no termine en `_test`.
 */
import bcrypt from 'bcryptjs';

export default async function setup() {
  const nombre = process.env.DB_NAME ?? '';
  if (!nombre.endsWith('_test')) {
    throw new Error(`Las pruebas de integración borran la base de datos. DB_NAME debe terminar en "_test" (actual: "${nombre}").`);
  }
  process.env.TAREAS = 'off';
  process.env.LIMITE_PETICIONES = '1000000';
  const { DataSource } = await import('typeorm');
  const { buildDataSourceOptions } = await import('../dist/database/database.config.js');
  const { calcularDv } = await import('../dist/common/rut.util.js');
  const ds = new DataSource(buildDataSourceOptions(process.env));
  await ds.initialize();
  await ds.dropDatabase();
  await ds.runMigrations();
  const cuerpo = 10000001;
  const hash = await bcrypt.hash('Prueba2026x', 4);
  const r = await ds.query(`INSERT INTO usuarios (rut, nombres, apellido_paterno, password_hash, activo) VALUES (?, 'Admin', 'Pruebas', ?, 1)`, [`${cuerpo}-${calcularDv(String(cuerpo))}`, hash]);
  await ds.query(`INSERT INTO usuario_rol (usuario_id, rol) VALUES (?, 'ADMINISTRADOR')`, [r.insertId]);
  await ds.destroy();
}
