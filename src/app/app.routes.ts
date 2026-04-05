import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { LiveTvComponent } from './pages/live-tv/live-tv';
import { SeriesComponent } from './pages/series/series';
import { MoviesComponent } from './pages/movies/movies';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'live', component: LiveTvComponent },
    { path: 'movies', component: MoviesComponent },
    { path: 'series', component: SeriesComponent },
];

