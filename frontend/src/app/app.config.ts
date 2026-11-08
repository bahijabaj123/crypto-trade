import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { ScenarioService } from './core/services/scenario.service';
import { AuthService } from './core/services/auth.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Au démarrage : vérifie la session gardée dans le navigateur, puis charge les scénarios gérés par l'admin
    provideAppInitializer(() => Promise.all([inject(AuthService).verifier(), inject(ScenarioService).charger()]))
  ]
};
