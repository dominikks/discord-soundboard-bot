import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { ApiService, AppInfo, User } from '../../services/api.service';
import { LoginComponent } from '../login/login.component';
import { DataLoadDirective } from '../../common/data-load/data-load.directive';

@Component({
  imports: [RouterOutlet, LoginComponent, DataLoadDirective],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {
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
