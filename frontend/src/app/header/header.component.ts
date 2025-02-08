import { Component, EventEmitter, Input, Output } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { EMPTY } from 'rxjs';
import { ApiService } from '../services/api.service';
import { MatToolbar, MatToolbarRow } from '@angular/material/toolbar';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconButton, MatAnchor } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatRipple } from '@angular/material/core';
import { MatTooltip } from '@angular/material/tooltip';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { MatDivider } from '@angular/material/divider';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [
    MatToolbar,
    MatToolbarRow,
    MatIconButton,
    MatIcon,
    RouterLink,
    NgTemplateOutlet,
    MatRipple,
    MatTooltip,
    MatMenuTrigger,
    MatMenu,
    MatMenuItem,
    MatDivider,
    MatAnchor,
    RouterLinkActive,
  ],
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
