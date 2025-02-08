import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { EMPTY } from 'rxjs';
import { MatToolbar, MatToolbarRow } from '@angular/material/toolbar';
import { NgTemplateOutlet } from '@angular/common';
import { MatAnchor, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatRipple } from '@angular/material/core';
import { MatTooltip } from '@angular/material/tooltip';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatDivider } from '@angular/material/divider';
import { ApiService } from '../../services/api.service';

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
  protected apiService = inject(ApiService);

  @Input({ required: true }) pageTitle: string;
  @Input() showSidenavToggle = false;

  @Output() toggleSidenav = new EventEmitter<void>();

  logout() {
    this.apiService
      .logout()
      .pipe(catchError(() => EMPTY))
      .subscribe();
  }
}
