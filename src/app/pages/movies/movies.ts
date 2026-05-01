import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { Channel, ChannelGroup } from '../../models/channel';
import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { PlayerService } from '../../services/player-service';

// ── Tipos para o virtual scroll por linhas ─────────────
export interface MovieRow {
  index: number;
  items: Channel[];
  ghosts: null[];
}

// ── Constantes de layout ───────────────────────────────
const CARD_WIDTH = 160;
const CARD_HEIGHT = 290;
const GAP = 18;
const ROW_PADDING = 28;
const COMPACT_BREAKPOINT = 920;

@Component({
  selector: 'app-movies',
  templateUrl: './movies.html',
  styleUrl: './movies.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NavbarComponent, ScrollingModule]
})
export class MoviesComponent extends PlayerService implements OnInit, OnDestroy {

  // videoPlayerRef já está declarado na classe base (PlayerBaseService)
  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;

  // ── Dados
  groups: ChannelGroup[] = [];
  selectedGroup: ChannelGroup | null = null;
  selectedMovie: Channel | null = null;
  searchQuery = '';

  // ── Player auto-hide
  isIdle = false;
  private idleTimeout: any;

  // ── Virtual scroll
  movieRows: MovieRow[] = [];
  rowHeight = CARD_HEIGHT + GAP;
  private colsCount = 6;

  // ── Streams RxJS
  private destroy$ = new Subject<void>();
  private search$ = new Subject<string>();

  constructor(
    private iptv: IptvService, cdr: ChangeDetectorRef) {
    super(cdr);
  }

  // ── Lifecycle ──────────────────────────────────────────

  async ngOnInit() {
    await this.iptv.reloadm3u('movie');
    this.groups = this.iptv.getGroupsByType('movie');
    this.preloadHls();        // agora vive na própria classe base
    this.startClock();
    this.calcCols();

    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.searchQuery = query;
      this.rebuildRows();
      this.cdr.markForCheck();
    });
  }

  override ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearIdleTimer();
    super.ngOnDestroy();   // destroyPlayer + clearInterval do relógio
  }

  // ── Responsividade ─────────────────────────────────────

  @HostListener('window:resize')
  onResize() {
    this.calcCols();
    this.rebuildRows();
    this.cdr.markForCheck();
  }

  private calcCols() {
    const isCompact = window.innerWidth <= COMPACT_BREAKPOINT;
    const sidebarWidth = isCompact ? 0 : 270;
    const horizontalPadding = isCompact ? 24 : ROW_PADDING * 2;
    const available = Math.max(320, window.innerWidth - sidebarWidth - horizontalPadding);
    this.colsCount = Math.max(2, Math.floor((available + GAP) / (CARD_WIDTH + GAP)));
  }

  // ── Grid ───────────────────────────────────────────────

  private rebuildRows() {
    const movies = this.filteredMovies;
    const cols = this.colsCount;
    const rows: MovieRow[] = [];

    for (let i = 0; i < movies.length; i += cols) {
      const slice = movies.slice(i, i + cols);
      const ghosts = slice.length < cols ? new Array(cols - slice.length).fill(null) : [];
      rows.push({ index: i / cols, items: slice, ghosts });
    }

    this.movieRows = rows;
  }

  // ── TrackBy ────────────────────────────────────────────

  trackByGroup(_: number, g: ChannelGroup) { return g.name; }
  trackByRow(_: number, r: MovieRow) { return r.index; }
  trackByMovie(_: number, m: Channel) { return m.id ?? m.url; }

  // ── Dados filtrados ─────────────────────────────────────

  get filteredMovies(): Channel[] {
    if (!this.selectedGroup) return [];
    if (!this.searchQuery) return this.selectedGroup.channels;
    const q = this.searchQuery.toLowerCase();
    return this.selectedGroup.channels.filter(c => c.name.toLowerCase().includes(q));
  }

  get totalMovies(): number { return this.iptv.getCount('movie'); }

  // ── Sidebar ────────────────────────────────────────────

  selectGroup(group: ChannelGroup) {
    this.selectedGroup = group;
    this.searchQuery = '';
    this.rebuildRows();
    this.cdr.markForCheck();
    setTimeout(() => this.viewport?.scrollToIndex(0, 'instant'), 0);
  }

  onSearchInput(value: string) { this.search$.next(value); }

  // ── Seleção do filme ───────────────────────────────────

  selectMovie(movie: Channel) {
    this.selectedMovie = movie;
    this.playerError = '';
    this.retryCount = 0;
    this.isIdle = false;
    this.resetIdleTimer();
    this.cdr.markForCheck();
    setTimeout(() => this.startPlayback(movie.url), 100);
  }

  retryCurrentMovie() {
    if (this.selectedMovie) this.retryPlayback(this.selectedMovie.url);
  }

  closePlayer() {
    this.destroyPlayer();
    this.selectedMovie = null;
    this.duration = '00:00';
    this.clearIdleTimer();
    this.cdr.markForCheck();
  }

  closePlayerIfBackdrop(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('player-fullscreen')) {
      this.closePlayer();
    }
  }

  onPlayerMouseMove() {
    this.isIdle = false;
    this.resetIdleTimer();
  }

  private resetIdleTimer() {
    this.clearIdleTimer();
    this.idleTimeout = setTimeout(() => {
      this.isIdle = true;
      this.cdr.detectChanges();
    }, 3000);
  }

  private clearIdleTimer() {
    if (this.idleTimeout) { clearTimeout(this.idleTimeout); this.idleTimeout = null; }
    this.isIdle = false;
  }

  // ── Progresso (sobrescreve para atualizar currentTime como posição) ──

  protected override updateProgress(video: HTMLVideoElement) {
    this.currentTime = this.fmtTime(video.currentTime);
    this.duration = isFinite(video.duration) ? this.fmtTime(video.duration) : '--:--';
    this.cdr.markForCheck();
  }
}