import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Especialidad, PerfilProfesional } from './profesionales.entities.js';
import { ProfesionalesController } from './profesionales.controller.js';
import { ProfesionalesService } from './profesionales.service.js';

/** M3. Profesionales y especialidades. */
@Module({
  imports: [TypeOrmModule.forFeature([Especialidad, PerfilProfesional])],
  controllers: [ProfesionalesController],
  providers: [ProfesionalesService],
  exports: [ProfesionalesService],
})
export class ProfesionalesModule {}
