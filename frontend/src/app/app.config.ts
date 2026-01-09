import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  LOCALE_ID,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  withRouterConfig,
} from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { map } from 'rxjs/operators';
import { TimeagoModule } from 'ngx-timeago';
import { APP_ROUTES } from './app.routes';
import { authInterceptor } from './services/auth-interceptor';
import { ApiService } from './services/api.service';
import { AppInfoState } from './services/app-info.state';

export const APP_CONFIG: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 5000,
      },
    },
    {
      provide: LOCALE_ID,
      useValue: 'en-US',
    },
    importProvidersFrom(TimeagoModule.forRoot()),
    provideRouter(
      APP_ROUTES,
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withPreloading(PreloadAllModules),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    provideAppInitializer(() => {
      const apiService = inject(ApiService);
      const appInfoState = inject(AppInfoState);

      // This call might fail, but that should be fine here, the app will just not load
      return apiService.loadAppInfo().pipe(
        map(appInfo => {
          appInfoState.initialize(appInfo);
          return null;
        }),
      );
    }),
  ],
};
