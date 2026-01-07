import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { AppSettingsService } from '../../../services/app-settings.service';

@Component({
  templateUrl: './user-settings.component.html',
  styleUrls: ['./user-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckbox, FormsModule],
})
export class UserSettingsComponent {
  settingsService = inject(AppSettingsService);
}
