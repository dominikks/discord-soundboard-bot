import { MediaMatcher } from '@angular/cdk/layout';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { ApiService } from '../services/api.service';

@Component({
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnDestroy, AfterViewInit {
  @ViewChild(MatSidenav) snav: MatSidenav;

  mobileQuery: MediaQueryList;
  toolbarBreakpointQuery: MediaQueryList;
  private _mediaQueryListener: () => void;

  private onDestroy$ = new Subject<void>();
  user$ = this.apiService.user$;
  guilds$ = this.apiService.user$.pipe(map(user => user.guilds.filter(guild => guild.role !== 'user')));

  constructor(private apiService: ApiService, private router: Router, changeDetectorRef: ChangeDetectorRef, media: MediaMatcher) {
    this.mobileQuery = media.matchMedia('(max-width: 750px)');
    this.toolbarBreakpointQuery = media.matchMedia('(max-width: 599px)');
    this._mediaQueryListener = () => changeDetectorRef.detectChanges();
    this.mobileQuery.addEventListener('change', this._mediaQueryListener);
    this.toolbarBreakpointQuery.addEventListener('change', this._mediaQueryListener);
  }

  ngAfterViewInit() {
    this.router.events.pipe(takeUntil(this.onDestroy$)).subscribe(() => {
      if (this.mobileQuery.matches) {
        this.snav.close();
      }
    });
  }

  ngOnDestroy() {
    this.toolbarBreakpointQuery.removeEventListener('change', this._mediaQueryListener);
    this.mobileQuery.removeEventListener('change', this._mediaQueryListener);
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }
}
