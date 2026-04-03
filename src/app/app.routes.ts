import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { HomeComponent } from './pages/home/home';
import { LiveTvComponent } from './pages/live-tv/live-tv';

export const routes: Routes = [
    // { path: '', component: LoginComponent },
    { path: '', component: HomeComponent },
    { path: 'live', component: LiveTvComponent },
];

