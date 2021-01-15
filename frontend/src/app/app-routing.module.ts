import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { KeybindGeneratorComponent } from './keybind-generator/keybind-generator.component';
import { RecorderComponent } from './recorder/recorder.component';
import { SoundboardComponent } from './soundboard/soundboard.component';

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
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true, relativeLinkResolution: 'legacy' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
