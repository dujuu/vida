import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacionesController } from './notificaciones.controller.js';
import { Notificacion, PreferenciaAviso } from './notificaciones.entities.js';
import { NotificacionesService } from './notificaciones.service.js';

/** M12. Notificaciones. Es global: los demás módulos le piden crear avisos. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notificacion, PreferenciaAviso])],
  controllers: [NotificacionesController],
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
