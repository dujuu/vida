import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionController } from './configuracion.controller.js';
import { Configuracion } from './configuracion.entity.js';
import { ConfiguracionService } from './configuracion.service.js';

/** M15. Configuración y métricas. Es global: los demás módulos leen sus parámetros desde aquí. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Configuracion])],
  controllers: [ConfiguracionController],
  providers: [ConfiguracionService],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
