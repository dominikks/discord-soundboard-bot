import { BrowserModule } from '@angular/platform-browser';
import { LOCALE_ID, NgModule } from '@angular/core';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SoundboardComponent } from './soundboard/soundboard.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSliderModule } from '@angular/material/slider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { MatListModule } from '@angular/material/list';
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
import { TimeagoModule } from 'ngx-timeago';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WebAudioModule } from '@ng-web-apis/audio';
import { NgxSliderModule } from '@angular-slider/ngx-slider';
import { FooterComponent } from './footer/footer.component';
import { HeaderComponent } from './header/header.component';
import { LoginComponent } from './login/login.component';
import { AuthInterceptorService } from './services/auth-interceptor.service';
import { SettingsComponent } from './settings/settings.component';
import { UserSettingsComponent } from './settings/user-settings/user-settings.component';
import { GuildSettingsComponent } from './settings/guild-settings/guild-settings.component';
import { RandomInfixesComponent } from './settings/random-infixes/random-infixes.component';
import { UnsavedChangesBoxComponent } from './settings/unsaved-changes-box/unsaved-changes-box.component';
import { ErrorBoxComponent } from './error-box/error-box.component';
import { SoundManagerComponent } from './settings/sound-manager/sound-manager.component';
import { SoundDetailsComponent } from './settings/sound-manager/sound-details/sound-details.component';
import { SoundDeleteConfirmComponent } from './settings/sound-manager/sound-delete-confirm/sound-delete-confirm.component';
import { GuildNamePipe } from './guild-name.pipe';
import { ScrollingModule } from '@angular/cdk/scrolling';

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
    LoginComponent,
    SettingsComponent,
    UserSettingsComponent,
    GuildSettingsComponent,
    RandomInfixesComponent,
    UnsavedChangesBoxComponent,
    ErrorBoxComponent,
    SoundManagerComponent,
    SoundDetailsComponent,
    SoundDeleteConfirmComponent,
    GuildNamePipe,
  ],
  imports: [
    // Angular
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    FormsModule,
    // Angular Material
    MatCardModule,
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
    MatDialogModule,
    DragDropModule,
    MatMenuModule,
    MatListModule,
    MatExpansionModule,
    MatDividerModule,
    MatTooltipModule,
    MatToolbarModule,
    MatSidenavModule,
    ScrollingModule,
    // Other Dependencies
    TimeagoModule.forRoot(),
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
        duration: 5000,
      },
    },
    {
      provide: LOCALE_ID,
      useValue: 'en-US',
    },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptorService, multi: true },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
