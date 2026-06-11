import { bootstrapApplication } from '@angular/platform-browser';
import { configureMaxGraphAssets } from './app/core/config/maxgraph.config';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

configureMaxGraphAssets();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
