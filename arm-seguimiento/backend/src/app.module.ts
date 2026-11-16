import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgendaModule } from './agenda/agenda.module.js';
import { AsignacionesModule } from './asignaciones/asignaciones.module.js';
import { AuditoriaModule } from './auditoria/auditoria.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CalendarioModule } from './calendario/calendario.module.js';
import { CitasModule } from './citas/citas.module.js';
import { ContextoMiddleware } from './common/contexto.js';
import { validarEntorno } from './common/entorno.js';
import { FiltroExcepciones } from './common/filtro-excepciones.js';
import { LimitadorMiddleware } from './common/limitador.middleware.js';
import { ConfiguracionModule } from './configuracion/configuracion.module.js';
import { ContactosModule } from './contactos/contactos.module.js';
import { buildDataSourceOptions } from './database/database.config.js';
import { FichaModule } from './ficha/ficha.module.js';
import { NotificacionesModule } from './notificaciones/notificaciones.module.js';
import { PacientesModule } from './pacientes/pacientes.module.js';
import { ProfesionalesModule } from './profesionales/profesionales.module.js';
import { RecomendacionesModule } from './recomendaciones/recomendaciones.module.js';
import { SeguimientoModule } from './seguimiento/seguimiento.module.js';
import { TareasModule } from './tareas/tareas.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';

/**
 * Módulo raíz. Reúne los módulos del sistema:
 * M1 autenticación, M2 usuarios, M3 profesionales, M4 pacientes, M5 asignaciones (relación y acceso clínico),
 * M6 agenda, M7 citas, M8 contactos, M9 ficha clínica, M10 recomendaciones (indicaciones), M11 calendario,
 * M12 notificaciones, M13 seguimiento, M14 auditoría y M15 configuración.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Si falta un dato obligatorio, el servidor no parte y dice cuál falta.
      validate: (config: Record<string, unknown>) => {
        validarEntorno(config as Record<string, string | undefined>);
        return config;
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions({
          DB_HOST: config.get('DB_HOST'),
          DB_PORT: config.get('DB_PORT'),
          DB_USER: config.get('DB_USER'),
          DB_PASS: config.get('DB_PASS'),
          DB_NAME: config.get('DB_NAME'),
        }),
    }),
    AuditoriaModule,
    ConfiguracionModule,
    AuthModule,
    UsuariosModule,
    ProfesionalesModule,
    PacientesModule,
    AsignacionesModule,
    AgendaModule,
    CitasModule,
    ContactosModule,
    FichaModule,
    RecomendacionesModule,
    CalendarioModule,
    NotificacionesModule,
    SeguimientoModule,
    TareasModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: FiltroExcepciones }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextoMiddleware, LimitadorMiddleware).forRoutes('*');
  }
}
