import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  loggedIn$ = new BehaviorSubject(true);

  constructor(private http: HttpClient) {}

  logout() {
    return this.http.post('/api/auth/logout', {}, { responseType: 'text' }).pipe(tap(() => this.loggedIn$.next(false)));
  }

  getAuthToken() {
    return this.http.post('/api/auth/gettoken', {}, { responseType: 'text' });
  }
}
