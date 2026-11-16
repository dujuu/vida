import { Module } from '@nestjs/common';
import { CalendarioModule } from '../calendario/calendario.module.js';
import { CitasModule } from '../citas/citas.module.js';
import { RecomendacionesModule } from '../recomendaciones/recomendaciones.module.js';
import { TareasService } from './tareas.service.js';

/** Tareas periódicas: avisos de cita y mantenimiento diario. */
@Module({
  imports: [CitasModule, CalendarioModule, RecomendacionesModule],
  providers: [TareasService],
  exports: [TareasService],
})
export class TareasModule {}
