import { MediaMatcher } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnDestroy, ViewChild } from '@angular/core';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatListItem, MatListItemIcon, MatListItemLine, MatListItemTitle, MatNavList } from '@angular/material/list';
import { HeaderComponent } from '../../common/header/header.component';
import { FooterComponent } from '../../common/footer/footer.component';
import { User } from '../../services/api.service';

@Component({
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HeaderComponent,
    MatSidenavContainer,
    MatSidenav,
    MatNavList,
    MatListItem,
    RouterLink,
    RouterLinkActive,
    MatListItemIcon,
    MatListItemTitle,
    MatListItemLine,
    MatSidenavContent,
    RouterOutlet,
    FooterComponent,
  ],
})
export class SettingsComponent implements OnDestroy {
  private router = inject(Router);

  @ViewChild(MatSidenav) sidenav!: MatSidenav;
  @Input({ required: true }) user!: User;

  readonly mobileQuery: MediaQueryList;
  readonly toolbarBreakpointQuery: MediaQueryList;
  private readonly _mediaQueryListener: () => void;

  readonly guilds = this.user.guilds.filter(guild => guild.role !== 'user');

  constructor() {
    const changeDetectorRef = inject(ChangeDetectorRef);
    const media = inject(MediaMatcher);

    this.mobileQuery = media.matchMedia('(max-width: 750px)');
    this.toolbarBreakpointQuery = media.matchMedia('(max-width: 599px)');
    this._mediaQueryListener = () => changeDetectorRef.detectChanges();
    this.mobileQuery.addEventListener('change', this._mediaQueryListener);
    this.toolbarBreakpointQuery.addEventListener('change', this._mediaQueryListener);

    this.router.events.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.mobileQuery.matches) {
        this.sidenav?.close();
      }
    });
  }

  ngOnDestroy() {
    this.toolbarBreakpointQuery.removeEventListener('change', this._mediaQueryListener);
    this.mobileQuery.removeEventListener('change', this._mediaQueryListener);
  }
}
