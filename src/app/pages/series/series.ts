import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { EpisodeFlat, Series, SeriesGroup } from '../../models/serie';
import { PlayerService } from '../../services/player-service';

// ─── Layout ────────────────────────────────────────────
const SIDEBAR_WIDTH = 240;
const SECTION_PADDING = 96;
const CARD_MIN_WIDTH = 155;
const GAP = 14;
const NAME_HEIGHT = 32;

function calcCols(availableWidth: number): number {
  const cols = Math.floor((availableWidth + GAP) / (CARD_MIN_WIDTH + GAP));
  return Math.max(2, Math.min(10, cols));
}

function calcCardHeight(cols: number, availableWidth: number): number {
  const cardWidth = (availableWidth - (cols - 1) * GAP) / cols;
  return Math.round(cardWidth * (3 / 2)) + NAME_HEIGHT;
}

@Component({
  selector: 'app-series',
  templateUrl: './series.html',
  styleUrl: './series.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, ScrollingModule]
})
export class SeriesComponent extends PlayerService implements OnInit, OnDestroy {

  // videoPlayerRef já está na base
  cols = 7;
  rowHeight = 300;
  isIdle = false;

  private resizeObserver: ResizeObserver | null = null;
  private idleTimeout: any = null;

  // ── Views
  view: 'browse' | 'episodes' | 'player' = 'browse';

  // ── Dados
  allSeriesGroups: SeriesGroup[] = [];
  selectedSeriesGroup: SeriesGroup | null = null;
  displaySeries: Series[] = [];
  selectedSeries: Series | null = null;
  selectedEpisode: EpisodeFlat | null = null;
  activeSeason = 1;

  // ── Buscas
  searchQuery = '';
  sidebarSearchQuery = '';

  // videoCurrentTime separado do relógio
  videoCurrentTime = '00:00';

  constructor(
    private router: Router,
    private iptv: IptvService,
    cdr: ChangeDetectorRef
  ) {
    super(cdr);
  }

  // ── Lifecycle ──────────────────────────────────────────

  async ngOnInit() {
    await this.iptv.reloadm3u('series');
    this.allSeriesGroups = this.buildSeriesGroups();
    this.startClock();
    this.initResizeObserver();
  }

  override ngOnDestroy() {
    this.clearIdleTimer();
    this.resizeObserver?.disconnect();
    super.ngOnDestroy();
  }

  get filteredSidebarGroups(): SeriesGroup[] {
    if (!this.sidebarSearchQuery) return this.allSeriesGroups;
    const q = this.sidebarSearchQuery.toLowerCase();
    return this.allSeriesGroups.filter(g => g.name.toLowerCase().includes(q));
  }
  // ── Layout ─────────────────────────────────────────────

  private initResizeObserver() {
    this.recalcLayout();
    this.resizeObserver = new ResizeObserver(() => this.recalcLayout());
    this.resizeObserver.observe(document.body);
  }

  private recalcLayout() {
    const isCompact = window.innerWidth <= 960;
    const sidebarWidth = isCompact ? 0 : SIDEBAR_WIDTH;
    const sectionPadding = isCompact ? 28 : SECTION_PADDING;
    const available = Math.max(320, window.innerWidth - sidebarWidth - sectionPadding);
    this.cols = calcCols(available);
    this.rowHeight = calcCardHeight(this.cols, available) + GAP;
    document.documentElement.style.setProperty('--cols', String(this.cols));
    this.cdr.detectChanges();
  }

  onGlobalSearch(q: string) { this.searchQuery = q; }
  goHome() { this.router.navigate(['/']); }

  selectSeriesGroup(group: SeriesGroup) {
    this.selectedSeriesGroup = group;
    this.displaySeries = [...group.series];
    this.selectedSeries = null;
    this.searchQuery = '';
    this.view = 'browse';
  }

  // ── Dados ──────────────────────────────────────────────

  private buildSeriesGroups(): SeriesGroup[] {
    const channels = this.iptv.getGroupsByType('series');
    const groupMap = new Map<string, Series[]>();

    channels.forEach(group => {
      group.channels.forEach(channel => {
        const title = this.extractSeriesTitle(channel.name);
        if (!groupMap.has(group.name)) groupMap.set(group.name, []);

        let series = groupMap.get(group.name)!.find(s => s.name === title);
        if (!series) {
          series = { name: title, seasons: [], group: group.name, logo: channel.logo };
          groupMap.get(group.name)!.push(series);
        }

        const { season, episode } = this.extractSeasonEpisode(channel.name);
        let seasonData = series.seasons.find(s => s.season === season);
        if (!seasonData) { seasonData = { season, episodes: [] }; series.seasons.push(seasonData); }

        seasonData.episodes.push({
          name: channel.name, url: channel.url, episode,
          logo: channel.logo, id: channel.id, group: group.name
        });
      });
    });

    return Array.from(groupMap.entries())
      .map(([name, series]) => ({ name, series: series.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getEpisodeCount(serie: Series | null): number {
    if (!serie) return 0;
    return serie.seasons.reduce((t, s) => t + s.episodes.length, 0);
  }

  private extractSeriesTitle(name: string): string {
    return name
      .replace(/\s*[Ss]\d{1,2}[Ee]\d{1,3}.*/g, '')
      .replace(/\s*\d{1,2}[Xx]\d{1,2}.*/g, '')
      .replace(/\s*[Tt]\d{1,2}\s*[Ee]\d{1,3}.*/g, '')
      .replace(/\s*[Ee][Pp]\s*\d+.*/g, '')
      .replace(/\s*[-–—]\s*[Ee]pisódio.*/gi, '')
      .trim() || name.trim();
  }

  private extractSeasonEpisode(name: string): { season: number; episode: number } {
    const m1 = name.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
    if (m1) return { season: +m1[1], episode: +m1[2] };
    const m2 = name.match(/(\d{1,2})[Xx](\d{1,2})/);
    if (m2) return { season: +m2[1], episode: +m2[2] };
    return { season: 1, episode: 1 };
  }

  // ── Hero ───────────────────────────────────────────────

  get heroSeries(): Series | null {
    const list = this.filteredDisplaySeries;
    return list.find(s => !!s.logo) ?? list[0] ?? null;
  }

  get heroFirstEpisode(): EpisodeFlat {
    const s = this.heroSeries;
    if (!s?.seasons[0]?.episodes[0]) return null as any;
    return this.toFlat(s.seasons[0].episodes[0], s.seasons[0].season, 0);
  }

  // ── Helpers ────────────────────────────────────────────

  toFlat(ep: any, _season: number, index: number): EpisodeFlat {
    return { ...ep, seriesName: this.selectedSeries?.name ?? '', epIndex: index + 1 };
  }

  get firstEpisode(): EpisodeFlat {
    const s = this.selectedSeries;
    if (!s?.seasons[0]?.episodes[0]) return null as any;
    return this.toFlat(s.seasons[0].episodes[0], s.seasons[0].season, 0);
  }

  getGhosts(row: Series[]): number[] {
    const missing = this.cols - row.length;
    return missing > 0 ? Array(missing).fill(0) : [];
  }

  // ── Navegação ──────────────────────────────────────────

  get filteredSeriesGroups(): SeriesGroup[] {
    if (!this.sidebarSearchQuery) return this.allSeriesGroups;
    const q = this.sidebarSearchQuery.toLowerCase();
    return this.allSeriesGroups.filter(g => g.name.toLowerCase().includes(q));
  }

  get filteredDisplaySeries(): Series[] {
    if (!this.searchQuery) return this.displaySeries;
    const q = this.searchQuery.toLowerCase();
    return this.displaySeries.filter(s => s.name.toLowerCase().includes(q));
  }

  get seriesPosterRows(): Series[][] {
    const series = this.filteredDisplaySeries;
    const rows: Series[][] = [];
    for (let i = 0; i < series.length; i += this.cols) {
      rows.push(series.slice(i, i + this.cols));
    }
    return rows;
  }

  // ── Episódios ──────────────────────────────────────────

  get selectedSeriesName(): string { return this.selectedSeries?.name ?? ''; }

  get allEpisodesOfSelectedSeries(): EpisodeFlat[] {
    if (!this.selectedSeries) return [];
    const eps: EpisodeFlat[] = [];
    this.selectedSeries.seasons.forEach(s =>
      s.episodes.forEach(e => eps.push({ ...e, seriesName: this.selectedSeries!.name }))
    );
    return eps.sort((a, b) => a.episode - b.episode);
  }

  get totalEpisodes(): number { return this.allEpisodesOfSelectedSeries.length; }

  // ── Player ─────────────────────────────────────────────

  playEpisode(ep: EpisodeFlat) {
    if (!ep) return;
    this.selectedEpisode = ep;
    this.playerError = '';
    this.retryCount = 0;
    this.view = 'player';
    setTimeout(() => {
      this.startPlayback(ep.url);
      this.enterFullscreen();
      this.resetIdleTimer();
    }, 100);
  }

  closePlayer() {
    this.exitFullscreen();
    this.clearIdleTimer();
    this.destroyPlayer();
    this.view = 'episodes';
    this.selectedEpisode = null;
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

  private enterFullscreen() {
    const el = document.documentElement as any;
    const fn = el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.mozRequestFullScreen ?? el.msRequestFullscreen;
    fn?.call(el)?.catch(() => { });
  }

  private exitFullscreen() {
    const doc = document as any;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) return;
    const fn = doc.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.mozCancelFullScreen ?? doc.msExitFullscreen;
    fn?.call(doc)?.catch(() => { });
  }

  // ── Hook da base: avança episódio ao término ───────────

  protected override onEnded(): void { this.nextEpisode(); }

  nextEpisode() {
    if (!this.selectedSeries || !this.selectedEpisode) return;
    const list = this.allEpisodesOfSelectedSeries;
    const idx = list.findIndex(e => e.id === this.selectedEpisode?.id);
    if (idx < list.length - 1) this.playEpisode(list[idx + 1]);
  }

  prevEpisode() {
    if (!this.selectedSeries || !this.selectedEpisode) return;
    const list = this.allEpisodesOfSelectedSeries;
    const idx = list.findIndex(e => e.id === this.selectedEpisode?.id);
    if (idx > 0) this.playEpisode(list[idx - 1]);
  }

  // ── Progresso: atualiza videoCurrentTime (≠ relógio) ──

  protected override updateProgress(video: HTMLVideoElement) {
    this.videoCurrentTime = this.fmtTime(video.currentTime);
    this.duration = isFinite(video.duration) ? this.fmtTime(video.duration) : '--:--';
    this.cdr.detectChanges();
  }

  backToSeries() {
    this.selectedSeries = null;
    this.searchQuery = '';
    this.view = 'browse';
  }

  /** Abre o drawer lateral de episódios */
  selectSeries(series: Series | null) {
    if (!series) return;
    this.selectedSeries = series;
    this.activeSeason = series.seasons[0]?.season ?? 1;
    this.searchQuery = '';
    this.view = 'episodes';
  }

  // ── TrackBy ────────────────────────────────────────────

  trackByIdx(_: number) { return _; }
  trackBySeriesName(_: number, s: Series) { return s.name; }
  trackByEpId(_: number, e: EpisodeFlat) { return e.id; }
}