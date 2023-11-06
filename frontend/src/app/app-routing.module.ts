import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { guildPermissionGuard } from './guards/guild-permission.guard';
import { KeybindGeneratorComponent } from './keybind-generator/keybind-generator.component';
import { RecorderComponent } from './recorder/recorder.component';
import { GuildSettingsComponent } from './settings/guild-settings/guild-settings.component';
import { SettingsComponent } from './settings/settings.component';
import { canDeactivateSoundManagerGuard } from './settings/sound-manager/can-deactivate-sound-manager.guard';
import { SoundManagerComponent } from './settings/sound-manager/sound-manager.component';
import { UserSettingsComponent } from './settings/user-settings/user-settings.component';
import { SoundboardComponent } from './soundboard/soundboard.component';
import { canDeactivateGuildSettingsGuard } from './settings/guild-settings/can-deactivate-guild-settings.guard';

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
        canActivate: [guildPermissionGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'settings',
          },
          {
            path: 'settings',
            component: GuildSettingsComponent,
            canDeactivate: [canDeactivateGuildSettingsGuard],
          },
          {
            path: 'sounds',
            component: SoundManagerComponent,
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

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: false, bindToComponentInputs: true })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
