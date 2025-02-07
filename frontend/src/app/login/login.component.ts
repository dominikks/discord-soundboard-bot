import { Component } from '@angular/core';
import { ApiService } from '../services/api.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    standalone: false
})
export class LoginComponent {
  constructor(protected apiService: ApiService) {}
}
