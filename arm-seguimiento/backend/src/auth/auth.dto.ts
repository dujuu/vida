import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { limpiarTexto } from '../common/texto.util.js';
import { Rol } from '../usuarios/rol.enum.js';

/** Elegir con qué rol se actúa en la sesión. */
export class ElegirRolDto {
  @ApiProperty({ enum: Rol })
  @IsEnum(Rol, { message: 'Rol inválido' })
  rol: Rol;
}

/** Activar una cuenta (o recuperar el acceso) con un código de un solo uso. */
export class ActivarCuentaDto {
  @ApiProperty({ example: '12.345.678-5' })
  @Transform(limpiarTexto)
  @IsString({ message: 'Ingrese su RUT' })
  @IsNotEmpty({ message: 'Ingrese su RUT' })
  @MaxLength(20, { message: 'El RUT es demasiado largo' })
  rut: string;

  @ApiProperty({ example: 'ABCD-EFGH' })
  @Transform(limpiarTexto)
  @IsString({ message: 'Ingrese el código' })
  @IsNotEmpty({ message: 'Ingrese el código' })
  @MaxLength(20, { message: 'El código es demasiado largo' })
  codigo: string;

  @ApiProperty({ description: 'Contraseña nueva: 8 a 72 caracteres, con letras y números.' })
  @IsString({ message: 'Ingrese una contraseña' })
  @MaxLength(72, { message: 'La contraseña es demasiado larga' })
  password: string;

  @ApiProperty({ required: false, description: 'El paciente acepta el consentimiento sobre sus datos de salud.' })
  @IsOptional()
  @IsBoolean()
  aceptaConsentimiento?: boolean;
}

/** Cambiar la contraseña propia. */
export class CambiarPasswordDto {
  @IsString({ message: 'Ingrese su contraseña actual' })
  @IsNotEmpty({ message: 'Ingrese su contraseña actual' })
  @MaxLength(72)
  actual: string;

  @IsString({ message: 'Ingrese la contraseña nueva' })
  @MaxLength(72, { message: 'La contraseña es demasiado larga' })
  nueva: string;
}
