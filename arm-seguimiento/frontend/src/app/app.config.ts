import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEsCl from '@angular/common/locales/es-CL';
import { ApplicationConfig, inject, LOCALE_ID, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { ErrorStateMatcher } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatIconRegistry } from '@angular/material/icon';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { authInterceptor } from './core/auth.interceptor';
import { ErrorSoloSiTocado } from './core/error-campo';

registerLocaleData(localeEsCl);

/**
 * Configuración global: rutas (con parámetros de ruta como entradas de los componentes), cliente HTTP con el interceptor de
 * sesión, idioma y zona del centro, íconos Material Symbols y formato por defecto de los campos de formulario.
 * Al arrancar intenta recuperar la sesión con la cookie de renovación, antes de decidir qué pantalla mostrar.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-CL' },
    provideAppInitializer(() => inject(AuthService).iniciar()),
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    }),
    { provide: ErrorStateMatcher, useClass: ErrorSoloSiTocado },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic', hideRequiredMarker: true } },
    { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { duration: 5000, horizontalPosition: 'center', verticalPosition: 'bottom' } },
  ],
};
