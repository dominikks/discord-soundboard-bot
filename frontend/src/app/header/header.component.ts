import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ApiService } from '../services/api.service';
import { LoginService } from '../services/login.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
  @Input() pageTitle: string;
  @Input() showSidenavToggle = false;

  @Output() toggleSidenav = new EventEmitter<void>();

  constructor(public apiService: ApiService, private loginService: LoginService) {}

  logout() {
    this.loginService.logout().subscribe();
  }
}
