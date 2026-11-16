import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentosService } from './documentos.service.js';
import { FichaController } from './ficha.controller.js';
import { Antecedente, Atencion, Diagnostico, Documento, Enmienda, Examen, SignosVitales } from './ficha.entities.js';
import { FichaService } from './ficha.service.js';

/** M9. Ficha clínica. */
@Module({
  imports: [TypeOrmModule.forFeature([Antecedente, Atencion, SignosVitales, Diagnostico, Examen, Documento, Enmienda])],
  controllers: [FichaController],
  providers: [FichaService, DocumentosService],
  exports: [FichaService],
})
export class FichaModule {}
