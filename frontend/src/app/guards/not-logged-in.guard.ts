import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';
import { ApiService } from '../services/api.service';

export const notLoggedInGuard: CanActivateFn = () => {
  const apiService = inject(ApiService);
  const router = inject(Router);

  return apiService.loadUser().pipe(
    map(() => {
      // Loading was successful -> redirect somewhere else
      return new RedirectCommand(router.parseUrl('/'));
    }),
    catchError(() => {
      // Loading failed -> the guard should accept
      return of(true);
    }),
  );
};
