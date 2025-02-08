import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppSettingsService } from 'src/app/services/app-settings.service';
import { MatCheckbox } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';

@Component({
  templateUrl: './user-settings.component.html',
  styleUrls: ['./user-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckbox, FormsModule],
})
export class UserSettingsComponent {
  constructor(public settingsService: AppSettingsService) {}
}
