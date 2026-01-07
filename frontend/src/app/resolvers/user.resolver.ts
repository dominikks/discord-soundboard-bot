import { RedirectCommand, ResolveFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ApiService, User } from '../services/api.service';

export const userResolver: ResolveFn<User> = () => {
  const apiService = inject(ApiService);
  const router = inject(Router);

  return apiService.loadUser().pipe(
    catchError(() => {
      return of(new RedirectCommand(router.parseUrl('/login')));
    }),
  );
};
