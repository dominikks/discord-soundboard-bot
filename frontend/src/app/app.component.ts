import { Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from './services/api.service';
import { LoginService } from './services/login.service';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  state: 'loading' | 'finished' | 'error' = 'loading';
  get loggedIn$() {
    return this.loginService.loggedIn$;
  }

  private onDestroy$ = new Subject<void>();

  constructor(private loginService: LoginService, private apiService: ApiService, private title: Title) {}

  ngOnInit() {
    this.apiService.appInfo$.pipe(takeUntil(this.onDestroy$)).subscribe(appInfo => {
      this.title.setTitle((appInfo.title + ' Soundboard').trim());
    });
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }
}
