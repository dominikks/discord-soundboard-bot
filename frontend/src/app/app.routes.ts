import { Routes } from '@angular/router';
import { guildPermissionGuard } from './guards/guild-permission.guard';
import { canDeactivateSoundManagerGuard } from './settings/sound-manager/can-deactivate-sound-manager.guard';
import { canDeactivateGuildSettingsGuard } from './settings/guild-settings/can-deactivate-guild-settings.guard';

export const APP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./soundboard/soundboard.component').then(m => m.SoundboardComponent),
  },
  {
    path: 'keybind-generator',
    loadComponent: () => import('./keybind-generator/keybind-generator.component').then(m => m.KeybindGeneratorComponent),
  },
  {
    path: 'recorder',
    loadComponent: () => import('./recorder/recorder.component').then(m => m.RecorderComponent),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'user',
      },
      {
        path: 'user',
        loadComponent: () => import('./settings/user-settings/user-settings.component').then(m => m.UserSettingsComponent),
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
            loadComponent: () => import('./settings/guild-settings/guild-settings.component').then(m => m.GuildSettingsComponent),
            canDeactivate: [canDeactivateGuildSettingsGuard],
          },
          {
            path: 'sounds',
            loadComponent: () => import('./settings/sound-manager/sound-manager.component').then(m => m.SoundManagerComponent),
            canDeactivate: [canDeactivateSoundManagerGuard],
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
