import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerfilProfesional } from '../profesionales/profesionales.entities.js';
import { AgendaController } from './agenda.controller.js';
import { BloqueHorario, Bloqueo, Feriado } from './agenda.entities.js';
import { AgendaService } from './agenda.service.js';

/** M6. Agenda: disponibilidad, bloqueos y horas libres. */
@Module({
  imports: [TypeOrmModule.forFeature([BloqueHorario, Bloqueo, Feriado, PerfilProfesional])],
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
