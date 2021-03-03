import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { GuildPermissionGuard } from './guards/guild-permission.guard';
import { KeybindGeneratorComponent } from './keybind-generator/keybind-generator.component';
import { RecorderComponent } from './recorder/recorder.component';
import { CanDeactivateGuildSettingsGuard } from './settings/guild-settings/can-deactivate-guild-settings.guard';
import { GuildSettingsComponent } from './settings/guild-settings/guild-settings.component';
import { SettingsComponent } from './settings/settings.component';
import { CanDeactivateSoundManagerGuard } from './settings/sound-manager/can-deactivate-sound-manager.guard';
import { SoundManagerComponent } from './settings/sound-manager/sound-manager.component';
import { UserSettingsComponent } from './settings/user-settings/user-settings.component';
import { SoundboardComponent } from './soundboard/soundboard.component';

const routes: Routes = [
  {
    path: '',
    component: SoundboardComponent,
  },
  {
    path: 'keybind-generator',
    component: KeybindGeneratorComponent,
  },
  {
    path: 'recorder',
    component: RecorderComponent,
  },
  {
    path: 'settings',
    component: SettingsComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'user',
      },
      {
        path: 'user',
        component: UserSettingsComponent,
      },
      {
        path: 'guilds/:guildId',
        canActivate: [GuildPermissionGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'settings',
          },
          {
            path: 'settings',
            component: GuildSettingsComponent,
            canDeactivate: [CanDeactivateGuildSettingsGuard],
          },
          {
            path: 'sounds',
            component: SoundManagerComponent,
            canDeactivate: [CanDeactivateSoundManagerGuard],
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

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true, relativeLinkResolution: 'legacy' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
