import { Component, EventEmitter, Input, Output } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { EMPTY } from 'rxjs';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
  @Input({ required: true }) pageTitle: string;
  @Input() showSidenavToggle = false;

  @Output() toggleSidenav = new EventEmitter<void>();

  constructor(protected apiService: ApiService) {}

  logout() {
    this.apiService
      .logout()
      .pipe(catchError(() => EMPTY))
      .subscribe();
  }
}
