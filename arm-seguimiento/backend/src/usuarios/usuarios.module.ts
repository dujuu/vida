import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosController } from './usuarios.controller.js';
import { UsuariosService } from './usuarios.service.js';
import { Usuario, UsuarioRol } from './usuario.entity.js';

/** M2. Usuarios y roles. Es global: otros módulos usan `UsuariosService.nombres`. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Usuario, UsuarioRol])],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
