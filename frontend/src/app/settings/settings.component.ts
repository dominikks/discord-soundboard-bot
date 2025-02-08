import { MediaMatcher } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../services/api.service';
import { HeaderComponent } from '../header/header.component';
import { MatNavList, MatListItem, MatListItemIcon, MatListItemTitle, MatListItemLine } from '@angular/material/list';
import { NgFor, NgIf } from '@angular/common';
import { FooterComponent } from '../footer/footer.component';

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
    NgFor,
    NgIf,
    MatListItemTitle,
    MatListItemLine,
    MatSidenavContent,
    RouterOutlet,
    FooterComponent,
  ],
})
export class SettingsComponent implements OnDestroy {
  @ViewChild(MatSidenav) sidenav: MatSidenav;

  readonly mobileQuery: MediaQueryList;
  readonly toolbarBreakpointQuery: MediaQueryList;
  private readonly _mediaQueryListener: () => void;

  readonly user = this.apiService.user();
  readonly guilds = this.user.guilds.filter(guild => guild.role !== 'user');

  constructor(private apiService: ApiService, private router: Router, changeDetectorRef: ChangeDetectorRef, media: MediaMatcher) {
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
