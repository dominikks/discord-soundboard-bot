import { Component } from '@angular/core';
import { AppSettingsService } from '../services/app-settings.service';

@Component({
    selector: 'app-volume-slider',
    templateUrl: './volume-slider.component.html',
    styleUrls: ['./volume-slider.component.scss'],
    standalone: false
})
export class VolumeSliderComponent {
  get settings() {
    return this.settingsService.settings;
  }

  constructor(private settingsService: AppSettingsService) {}

  formatLabel(value: number): string {
    return `${value.toFixed(0)} %`;
  }
}
