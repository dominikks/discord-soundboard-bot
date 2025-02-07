import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppSettingsService } from 'src/app/services/app-settings.service';

@Component({
    templateUrl: './user-settings.component.html',
    styleUrls: ['./user-settings.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class UserSettingsComponent {
  constructor(public settingsService: AppSettingsService) {}
}
