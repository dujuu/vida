import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccesoClinicoService } from './acceso-clinico.service.js';
import { DoctorPaciente } from './doctor-paciente.entity.js';
import { RelacionesController } from './relaciones.controller.js';
import { RelacionesService } from './relaciones.service.js';

/** M5. Relación médico–paciente y acceso clínico. Es global: todos los módulos clínicos usan `AccesoClinicoService`. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DoctorPaciente])],
  controllers: [RelacionesController],
  providers: [AccesoClinicoService, RelacionesService],
  exports: [AccesoClinicoService, RelacionesService],
})
export class AsignacionesModule {}
