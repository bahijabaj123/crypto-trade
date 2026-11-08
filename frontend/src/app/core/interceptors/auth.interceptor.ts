import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_BASE, AuthService } from '../services/auth.service';

/**
 * Ajoute « Authorization: Bearer <jeton> » à toutes les requêtes vers notre backend.
 * Si le serveur répond 401 (jeton expiré ou compte bloqué) : retour à la page de connexion.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const versNotreApi = req.url.startsWith(API_BASE);
  const jeton = auth.jeton;

  const requete = versNotreApi && jeton
    ? req.clone({ setHeaders: { Authorization: `Bearer ${jeton}` } })
    : req;

  return next(requete).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && e.status === 401 && versNotreApi && jeton && !req.url.includes('/auth/')) {
        auth.deconnecter(true);
      }
      return throwError(() => e);
    })
  );
};
