import { Routes } from '@angular/router';
import { guildPermissionGuard } from './guards/guild-permission.guard';
import { canDeactivateSoundManagerGuard } from './pages/settings/sound-manager/can-deactivate-sound-manager.guard';
import { canDeactivateGuildSettingsGuard } from './pages/settings/guild-settings/can-deactivate-guild-settings.guard';
import { LandingPageComponent } from './pages/landing-page/landing-page.component';
import { MainLayoutComponent } from './pages/main-layout/main-layout.component';

export const APP_ROUTES: Routes = [
  {
    path: '',
    component: LandingPageComponent,
  },
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: 'soundboard',
        loadComponent: () => import('./pages/soundboard/soundboard.component').then(m => m.SoundboardComponent),
      },
      {
        path: 'keybind-generator',
        loadComponent: () =>
          import('./pages/keybind-generator/keybind-generator.component').then(m => m.KeybindGeneratorComponent),
      },
      {
        path: 'recorder',
        loadComponent: () => import('./pages/recorder/recorder.component').then(m => m.RecorderComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent),
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'user',
          },
          {
            path: 'user',
            loadComponent: () =>
              import('./pages/settings/user-settings/user-settings.component').then(m => m.UserSettingsComponent),
          },
          {
            path: 'guilds/:guildId',
            canActivate: [guildPermissionGuard],
            children: [
              {
                path: '',
                pathMatch: 'full',
                redirectTo: 'settings',
              },
              {
                path: 'settings',
                loadComponent: () =>
                  import('./pages/settings/guild-settings/guild-settings.component').then(
                    m => m.GuildSettingsComponent,
                  ),
                canDeactivate: [canDeactivateGuildSettingsGuard],
              },
              {
                path: 'sounds',
                loadComponent: () =>
                  import('./pages/settings/sound-manager/sound-manager.component').then(m => m.SoundManagerComponent),
                canDeactivate: [canDeactivateSoundManagerGuard],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
