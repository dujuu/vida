/**
 * Validación de la configuración del entorno al arrancar.
 *
 * Si falta un dato obligatorio, el servidor no parte y dice cuál falta, en vez de fallar más tarde con un
 * error confuso.
 */

/** Valores del entorno ya validados. */
export interface Entorno {
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASS: string;
  DB_NAME: string;
  JWT_SECRET: string;
  PORT: number;
  /** `desarrollo` muestra Swagger y permite el script de demostración; `piloto` los bloquea. */
  MODO: 'desarrollo' | 'piloto';
  /** Carpeta donde se guardan los documentos de la ficha clínica. */
  ARCHIVOS_DIR: string;
  /** Carpeta de la web compilada que el backend sirve. */
  WEB_DIR: string | null;
  /** Si es `true`, la cookie de renovación lleva la marca `Secure` (solo con HTTPS). */
  COOKIE_SECURE: boolean;
}

/**
 * Valida y normaliza las variables de entorno.
 *
 * @param env Variables de entorno (normalmente `process.env`).
 * @returns El entorno validado.
 * @throws Error con la lista de problemas si falta o es inválido algún dato obligatorio.
 */
export function validarEntorno(env: Record<string, string | undefined>): Entorno {
  const problemas: string[] = [];
  const exigir = (clave: string): string => {
    const v = env[clave];
    if (!v || v.trim() === '') problemas.push(`Falta la variable ${clave}`);
    return v ?? '';
  };

  const DB_USER = exigir('DB_USER');
  const DB_PASS = exigir('DB_PASS');
  const DB_NAME = exigir('DB_NAME');
  const JWT_SECRET = exigir('JWT_SECRET');
  if (JWT_SECRET && JWT_SECRET.length < 32) problemas.push('JWT_SECRET debe tener al menos 32 caracteres');

  const DB_PORT = Number(env.DB_PORT ?? 3306);
  const PORT = Number(env.PORT ?? 3000);
  if (!Number.isInteger(DB_PORT) || DB_PORT <= 0) problemas.push('DB_PORT no es un número válido');
  if (!Number.isInteger(PORT) || PORT <= 0) problemas.push('PORT no es un número válido');

  const modo = (env.MODO ?? (env.NODE_ENV === 'production' ? 'piloto' : 'desarrollo')).toLowerCase();
  if (modo !== 'desarrollo' && modo !== 'piloto') problemas.push('MODO debe ser desarrollo o piloto');

  if (problemas.length > 0) {
    throw new Error(`Configuración inválida:\n - ${problemas.join('\n - ')}`);
  }
  return {
    DB_HOST: env.DB_HOST ?? '127.0.0.1',
    DB_PORT,
    DB_USER,
    DB_PASS,
    DB_NAME,
    JWT_SECRET,
    PORT,
    MODO: modo as 'desarrollo' | 'piloto',
    ARCHIVOS_DIR: env.ARCHIVOS_DIR ?? './archivos',
    WEB_DIR: env.WEB_DIR ?? null,
    COOKIE_SECURE: env.COOKIE_SECURE === 'true',
  };
}
