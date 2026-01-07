import { Component, EventEmitter, inject, Input, Output, Signal } from '@angular/core';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatToolbar, MatToolbarRow } from '@angular/material/toolbar';
import { NgTemplateOutlet } from '@angular/common';
import { MatAnchor, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatRipple } from '@angular/material/core';
import { MatTooltip } from '@angular/material/tooltip';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatDivider } from '@angular/material/divider';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService, User } from '../../services/api.service';
import { AppInfoState } from '../../services/app-info.state';

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
  protected appInfoState = inject(AppInfoState);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @Input({ required: true }) pageTitle!: string;
  @Input() showSidenavToggle = false;

  @Output() toggleSidenav = new EventEmitter<void>();

  protected user: Signal<User | undefined> = toSignal(this.route.data.pipe(map(data => data['user'])));

  logout() {
    this.apiService
      .logout()
      .pipe(catchError(() => of(null)))
      .subscribe(() => this.router.navigate(['login']));
  }
}
