import { Module } from '@nestjs/common';
import { SeguimientoController } from './seguimiento.controller.js';
import { SeguimientoService } from './seguimiento.service.js';

/** M13. Seguimiento y dashboard de continuidad. No tiene tablas propias. */
@Module({
  controllers: [SeguimientoController],
  providers: [SeguimientoService],
  exports: [SeguimientoService],
})
export class SeguimientoModule {}
