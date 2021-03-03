import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SettingsService } from 'src/app/services/settings.service';

@Component({
  templateUrl: './user-settings.component.html',
  styleUrls: ['./user-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSettingsComponent {
  constructor(public settingsService: SettingsService) {}
}
