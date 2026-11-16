import { Injectable } from '@angular/core';
import type { AbstractControl } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';

/**
 * Cuándo mostrar el error de un campo: solo si la persona ya lo tocó o lo editó. A diferencia del criterio por defecto de Material,
 * no se basa en que el formulario fue «enviado», de modo que al limpiar un formulario después de guardar no aparecen errores rojos.
 * Al enviar con errores, cada pantalla marca los campos como tocados y los errores sí se ven.
 */
@Injectable()
export class ErrorSoloSiTocado implements ErrorStateMatcher {
  isErrorState(control: AbstractControl | null): boolean {
    return !!(control && control.invalid && (control.touched || control.dirty));
  }
}
