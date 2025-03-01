import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { ApiService, AppInfo, User } from './services/api.service';
import { DataLoadDirective } from './common/data-load/data-load.directive';

import { LoginComponent } from './pages/login/login.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataLoadDirective, RouterOutlet, LoginComponent],
})
export class AppComponent {
  protected apiService = inject(ApiService);

  readonly data$ = forkJoin([
    this.apiService.loadAppInfo(),
    this.apiService.loadUser().pipe(catchError(() => of(null))),
  ]);
  readonly loadedData$ = new Subject<[AppInfo, User]>();

  constructor() {
    this.loadedData$.pipe(takeUntilDestroyed()).subscribe(data => {
      this.apiService.appInfo.set(data[0]);
      this.apiService.user.set(data[1]);
    });
  }
}
