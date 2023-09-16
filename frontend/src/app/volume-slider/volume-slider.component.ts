import { Component } from '@angular/core';
import { SettingsService } from '../services/settings.service';

@Component({
  selector: 'app-volume-slider',
  templateUrl: './volume-slider.component.html',
  styleUrls: ['./volume-slider.component.scss'],
})
export class VolumeSliderComponent {
  get settings() {
    return this.settingsService.settings;
  }

  constructor(private settingsService: SettingsService) {}

  formatLabel(value: number): string {
    return `${value.toFixed(0)} %`;
  }
}
