import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consentimiento } from '../pacientes/pacientes.entities.js';
import { Usuario, UsuarioRol } from '../usuarios/usuario.entity.js';
import { CodigoAcceso, IntentoLogin, Sesion } from './auth.entities.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CodigosService } from './codigos.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

/**
 * M1. Autenticación y sesiones. Registra los guardias globales: toda ruta exige sesión salvo las `@Public()`,
 * y las que declaran `@Roles(...)` exigen además ese rol activo. Es global porque otros módulos emiten códigos.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, UsuarioRol, Sesion, CodigoAcceso, IntentoLogin, Consentimiento]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '15m') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    CodigosService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, CodigosService],
})
export class AuthModule {}
