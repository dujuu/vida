import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PacientesController } from './pacientes.controller.js';
import { PacientesService } from './pacientes.service.js';
import { Consentimiento, PerfilPaciente } from './pacientes.entities.js';

/** M4. Pacientes (registro administrativo). */
@Module({
  imports: [TypeOrmModule.forFeature([Usuario, PerfilPaciente, Consentimiento])],
  controllers: [PacientesController],
  providers: [PacientesService],
  exports: [PacientesService],
})
export class PacientesModule {}
