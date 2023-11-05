import { ChangeDetectionStrategy, Component } from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService, AppInfo, User } from './services/api.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly data$ = forkJoin([this.apiService.loadAppInfo(), this.apiService.loadUser().pipe(catchError(() => of(null)))]);
  readonly loadedData$ = new Subject<[AppInfo, User]>();

  constructor(protected apiService: ApiService) {
    this.loadedData$.pipe(takeUntilDestroyed()).subscribe(data => {
      this.apiService.appInfo.set(data[0]);
      this.apiService.user.set(data[1]);
    });
  }
}
