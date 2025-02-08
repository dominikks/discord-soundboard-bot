import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiService = inject(ApiService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        apiService.user.set(null);
      }

      console.error(error);
      return throwError(() => error);
    })
  );
};
