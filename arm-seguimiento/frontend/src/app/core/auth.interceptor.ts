import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Rutas que no llevan token ni se reintentan: son las que crean o renuevan la sesión. */
const PUBLICAS = /^\/api\/(auth\/(login|renovar|activar|clave-unica-simulada)|configuracion\/publica)/;

/**
 * Agrega el token a las peticiones de la API. Si el servidor responde 401 (token vencido), renueva la sesión una vez y
 * repite la petición; si la renovación falla, cierra la sesión local y lleva al inicio de sesión.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const esApi = req.url.startsWith('/api');
  const publica = PUBLICAS.test(req.url);
  const conToken = (r: HttpRequest<unknown>) => {
    const token = auth.token();
    return token && esApi && !publica ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;
  };

  return next(conToken(req)).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && esApi && !publica) {
        return from(auth.renovar()).pipe(
          switchMap((ok) => {
            if (ok) return next(conToken(req));
            auth.cerrarLocal();
            return throwError(() => err);
          }),
        );
      }
      return throwError(() => err);
    }),
  );
};
