import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarioModule } from '../calendario/calendario.module.js';
import { Pauta, Recomendacion, RecomendacionVersion } from './recomendacion.entity.js';
import { RecomendacionesController } from './recomendaciones.controller.js';
import { RecomendacionesService } from './recomendaciones.service.js';

/** M10. Indicaciones y pautas. */
@Module({
  imports: [TypeOrmModule.forFeature([Recomendacion, Pauta, RecomendacionVersion]), CalendarioModule],
  controllers: [RecomendacionesController],
  providers: [RecomendacionesService],
  exports: [RecomendacionesService],
})
export class RecomendacionesModule {}
