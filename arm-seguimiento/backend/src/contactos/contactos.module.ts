import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactosController } from './contactos.controller.js';
import { Contacto } from './contacto.entity.js';
import { ContactosService } from './contactos.service.js';

/** M8. Contactos: formulario estandarizado de contacto. */
@Module({
  imports: [TypeOrmModule.forFeature([Contacto])],
  controllers: [ContactosController],
  providers: [ContactosService],
  exports: [ContactosService],
})
export class ContactosModule {}
