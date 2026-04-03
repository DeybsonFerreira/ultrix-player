import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { LiveTvComponent } from './pages/live-tv/live-tv';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'live', component: LiveTvComponent },
];

