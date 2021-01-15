import { BrowserModule } from '@angular/platform-browser';
import { LOCALE_ID, NgModule } from '@angular/core';
import localeDe from '@angular/common/locales/de';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SoundboardComponent } from './soundboard/soundboard.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSliderModule } from '@angular/material/slider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { SoundboardButtonComponent } from './soundboard/soundboard-button/soundboard-button.component';
import { KeybindGeneratorComponent } from './keybind-generator/keybind-generator.component';
import { KeycombinationInputComponent } from './keybind-generator/keycombination-input/keycombination-input.component';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { SearchableSoundSelectComponent } from './keybind-generator/searchable-sound-select/searchable-sound-select.component';
import { RecorderComponent } from './recorder/recorder.component';
import { TimeagoCustomFormatter, TimeagoFormatter, TimeagoIntl, TimeagoModule } from 'ngx-timeago';
import { registerLocaleData } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WebAudioModule } from '@ng-web-apis/audio';
import { NgxSliderModule } from '@angular-slider/ngx-slider';
import { FooterComponent } from './footer/footer.component';
import { HeaderComponent } from './header/header.component';

registerLocaleData(localeDe, 'de-DE');

@NgModule({
  declarations: [
    AppComponent,
    SoundboardComponent,
    SoundboardButtonComponent,
    KeybindGeneratorComponent,
    KeycombinationInputComponent,
    SearchableSoundSelectComponent,
    RecorderComponent,
    FooterComponent,
    HeaderComponent,
  ],
  imports: [
    // Angular
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    FormsModule,
    // Angular Material
    MatButtonModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatSliderModule,
    MatIconModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatRippleModule,
    MatCheckboxModule,
    MatSelectModule,
    MatTableModule,
    DragDropModule,
    MatMenuModule,
    MatExpansionModule,
    MatDividerModule,
    MatTooltipModule,
    MatToolbarModule,
    // Other Dependencies
    TimeagoModule.forRoot({
      intl: { provide: TimeagoIntl, useClass: TimeagoIntl },
      formatter: { provide: TimeagoFormatter, useClass: TimeagoCustomFormatter },
    }),
    WebAudioModule,
    NgxSliderModule,
    NgxMatSelectSearchModule,
  ],
  providers: [
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        horizontalPosition: 'center',
        verticalPosition: 'top',
      },
    },
    {
      provide: LOCALE_ID,
      useValue: 'en-US',
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
