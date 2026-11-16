import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgendaModule } from '../agenda/agenda.module.js';
import { CitasController } from './citas.controller.js';
import { Cita, CitaHistorial } from './citas.entities.js';
import { CitasService } from './citas.service.js';

/** M7. Citas. */
@Module({
  imports: [TypeOrmModule.forFeature([Cita, CitaHistorial]), AgendaModule],
  controllers: [CitasController],
  providers: [CitasService],
  exports: [CitasService],
})
export class CitasModule {}
