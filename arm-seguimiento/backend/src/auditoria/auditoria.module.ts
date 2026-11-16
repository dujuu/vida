import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auditoria } from './auditoria.entity.js';
import { AuditoriaController } from './auditoria.controller.js';
import { AuditoriaService } from './auditoria.service.js';

/** M14. Auditoría. Es global: todos los módulos pueden registrar eventos. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Auditoria])],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
