import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarioController } from './calendario.controller.js';
import { CalendarioService } from './calendario.service.js';
import { EventoTratamiento } from './evento-tratamiento.entity.js';

/** M11. Calendario y tomas. */
@Module({
  imports: [TypeOrmModule.forFeature([EventoTratamiento])],
  controllers: [CalendarioController],
  providers: [CalendarioService],
  exports: [CalendarioService],
})
export class CalendarioModule {}
