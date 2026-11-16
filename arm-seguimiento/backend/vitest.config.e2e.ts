import { defineConfig } from 'vitest/config';

/**
 * Pruebas de integración contra una base de datos MariaDB real y la aplicación compilada (`dist`).
 *
 * Requieren `DB_NAME` terminado en `_test`: la preparación borra y vuelve a crear el esquema completo.
 * Los archivos corren uno tras otro porque comparten la base.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
