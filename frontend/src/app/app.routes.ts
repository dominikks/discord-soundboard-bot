import { Routes } from '@angular/router';
import { canDeactivateSoundManagerGuard } from './pages/settings/sound-manager/can-deactivate-sound-manager.guard';
import { canDeactivateGuildSettingsGuard } from './pages/settings/guild-settings/can-deactivate-guild-settings.guard';
import { LoginComponent } from './pages/login/login.component';
import { notLoggedInGuard } from './guards/not-logged-in.guard';
import { guildPermissionGuard } from './guards/guild-permission.guard';
import { userResolver } from './resolvers/user.resolver';

export const APP_ROUTES: Routes = [
  {
    path: 'login',
    canActivate: [notLoggedInGuard],
    component: LoginComponent,
  },
  {
    path: '',
    resolve: {
      user: userResolver,
    },
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
      {
        path: '**',
        redirectTo: 'soundboard',
      },
    ],
  },
];
