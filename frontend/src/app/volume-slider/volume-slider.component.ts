import { Component, inject } from '@angular/core';
import { AppSettingsService } from '../services/app-settings.service';
import { MatIcon } from '@angular/material/icon';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-volume-slider',
  templateUrl: './volume-slider.component.html',
  styleUrls: ['./volume-slider.component.scss'],
  imports: [MatIcon, MatSlider, MatSliderThumb, FormsModule],
})
export class VolumeSliderComponent {
  private settingsService = inject(AppSettingsService);

  get settings() {
    return this.settingsService.settings;
  }

  formatLabel(value: number): string {
    return `${value.toFixed(0)} %`;
  }
}
