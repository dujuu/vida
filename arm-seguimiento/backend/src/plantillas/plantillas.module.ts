import { Module } from '@nestjs/common';
import { PlantillasController } from './plantillas.controller.js';
import { PlantillasService } from './plantillas.service.js';

/** Plantillas de indicaciones creadas por el administrador y el director médico. */
@Module({
  controllers: [PlantillasController],
  providers: [PlantillasService],
})
export class PlantillasModule {}
