import { Injectable } from '@angular/core';
import { Observable, ReplaySubject, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class ErrorService {
  private errorsSubject$ = new ReplaySubject<string>();
  errors$ = this.errorsSubject$.asObservable();

  showError<T>(message: string) {
    return catchError<T, Observable<never>>(error => {
      console.error('caught error', message, error);
      this.errorsSubject$.next(message);
      return throwError(error);
    });
  }
}
