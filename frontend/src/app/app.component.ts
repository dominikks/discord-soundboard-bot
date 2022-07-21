import { Component } from '@angular/core';
import { LoginService } from './services/login.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  state: 'loading' | 'finished' | 'error' = 'loading';
  get loggedIn$() {
    return this.loginService.loggedIn$;
  }

  constructor(private loginService: LoginService) {}
}
