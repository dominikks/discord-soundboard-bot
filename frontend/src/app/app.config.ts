import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { APP_ROUTES } from './app.routes';
import { authInterceptor } from './services/auth-interceptor';

export const APP_CONFIG: ApplicationConfig = {
  providers: [
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
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
  ],
};
