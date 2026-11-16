import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { validarEntorno } from './common/entorno.js';

/**
 * Arranca el servidor.
 *
 * - Todas las rutas de la API viven bajo `/api`.
 * - Si existe la web compilada (`WEB_DIR`, o `frontend/dist/frontend/browser`), el mismo servidor la entrega, de modo
 *   que la web y la API comparten origen: sin CORS y con una sola dirección para todos los dispositivos de la red.
 * - Swagger solo se publica en modo desarrollo.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const entorno = validarEntorno(process.env);

  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Cabeceras de seguridad. En la red local la conexión es HTTP: se quitan HSTS y la orden de pasar todo a HTTPS.
  app.use(
    helmet({
      hsts: false,
      contentSecurityPolicy:
        entorno.MODO === 'piloto'
          ? {
              useDefaults: true,
              directives: { 'upgrade-insecure-requests': null, 'img-src': ["'self'", 'data:', 'blob:'], 'frame-ancestors': ["'none'"] },
            }
          : false,
    }),
  );

  const origenes = (process.env.CORS_ORIGENES ?? 'http://localhost:4200').split(',').map((o) => o.trim());
  app.enableCors({ origin: origenes, credentials: true });

  if (entorno.MODO === 'desarrollo') {
    const configuracion = new DocumentBuilder()
      .setTitle('Sistema de seguimiento y fidelización de tratamientos')
      .setDescription(
        'API del Centro Médico Vida Norte SpA: cuatro roles (paciente, médico, recepcionista y administrador), agenda y citas, ' +
          'ficha clínica, indicaciones con calendario de tomas, contactos, seguimiento y auditoría. Para probar las rutas protegidas, ' +
          'inicie sesión en `POST /api/auth/login`, copie el `accessToken` y péguelo en el botón Authorize.',
      )
      .setVersion('2.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token de acceso obtenido en POST /api/auth/login.' })
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, configuracion), {
      useGlobalPrefix: true,
      customSiteTitle: 'API Vida Norte',
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // La web compilada, si existe.
  const candidatos = [entorno.WEB_DIR, resolve(process.cwd(), '../frontend/dist/frontend/browser')].filter((x): x is string => !!x);
  const webDir = candidatos.find((d) => existsSync(join(d, 'index.html')));
  if (webDir) {
    app.useStaticAssets(webDir, { index: false, maxAge: '1h' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDir, 'index.html'));
    });
    new Logger('Web').log(`Sirviendo la web desde ${webDir}`);
  }

  await app.listen(entorno.PORT, '0.0.0.0');
}
await bootstrap();
