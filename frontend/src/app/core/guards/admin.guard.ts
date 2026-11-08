import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Réserve une page aux administrateurs : sinon, redirection vers la connexion. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.estAdmin()) return true;
  return inject(Router).createUrlTree(['/signin'], {
    queryParams: { retour: state.url, ...(auth.estConnecte() ? { refuse: 1 } : {}) }
  });
};
