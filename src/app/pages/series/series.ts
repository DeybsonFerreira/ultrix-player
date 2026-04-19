import {
  ChangeDetectorRef, Component, OnInit, OnDestroy,
  ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { HLS_CONFIG } from '../../models/hls.config';
import { PlayerService } from '../../services/player-service';
import { EpisodeFlat, Series, SeriesGroup } from '../../models/serie';

// ─── Constantes de layout ──────────────────────────────────────────────────────
const POSTERS_PER_ROW = 6;          // cartazes de 148px em tela cheia
const CARD_HEIGHT = 290; // px — altura do cartão (poster 2:3 + label)
const GAP = 18;  // px — gap entre cartões

// ─── Componente ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-series',
  templateUrl: './series.html',
  styleUrl: './series.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, ScrollingModule]
})
export class SeriesComponent implements OnInit, OnDestroy {

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  rowHeight = CARD_HEIGHT + GAP;   // altura total de cada linha renderizada pelo CDK

  // ── Navegação: 'browse' | 'episodes' | 'player'
  view: 'browse' | 'episodes' | 'player' = 'browse';

  // ── Dados
  allSeriesGroups: SeriesGroup[] = [];
  selectedSeriesGroup: SeriesGroup | null = null;
  displaySeries: Series[] = [];
  selectedSeries: Series | null = null;
  selectedEpisode: EpisodeFlat | null = null;

  // ── Buscas
  searchQuery = '';
  sidebarSearchQuery = '';

  // ── Player
  isPlaying = false;
  isBuffering = false;
  playerError = '';
  volume = 80;
  isMuted = false;
  videoCurrentTime = '00:00';
  duration = '00:00';

  private hls: any = null;
  private retryTimeout: any;
  private retryCount = 0;
  private readonly MAX_RETRIES = 3;
  private clockInterval: any;
  currentTime = '';

  constructor(
    private router: Router,
    private iptv: IptvService,
    private cdr: ChangeDetectorRef,
    private playerService: PlayerService
  ) { }

  async ngOnInit() {
    await this.iptv.reloadm3u('series');
    this.loadSeriesGroups();
    this.playerService.preloadHls();
    this.startClock();
  }

  ngOnDestroy() {
    this.destroyPlayer();
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
  }

  // ─── Dados ───────────────────────────────────────────────────────────────────

  private loadSeriesGroups() {
    this.allSeriesGroups = this.buildSeriesGroups();
  }

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

  getEpisodeCount(serie: Series): number {
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

  // ─── Helper: converte ep de temporada → EpisodeFlat ──────────────────────────

  toFlat(ep: any, _season: number, index: number): EpisodeFlat {
    return { ...ep, seriesName: this.selectedSeries?.name ?? '', epIndex: index + 1 };
  }

  // ─── Primeiro episódio (para "Assistir do início") ────────────────────────────

  get firstEpisode(): EpisodeFlat {
    const s = this.selectedSeries;
    if (!s || !s.seasons.length || !s.seasons[0].episodes.length) return null as any;
    return this.toFlat(s.seasons[0].episodes[0], s.seasons[0].season, 0);
  }

  // ─── Slots fantasma (completa última linha do grid) ───────────────────────────

  getGhosts(row: Series[]): number[] {
    const missing = POSTERS_PER_ROW - row.length;
    return missing > 0 ? Array(missing).fill(0) : [];
  }

  // ─── Clock ────────────────────────────────────────────────────────────────────

  startClock() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    this.currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.cdr.detectChanges();
  }

  // ─── Navegação ────────────────────────────────────────────────────────────────

  goHome() { this.router.navigate(['/']); }

  onGlobalSearch(q: string) { this.searchQuery = q; }

  /** Fecha a tela de episódios → volta ao browse */
  backToSeries() {
    this.selectedSeries = null;
    this.searchQuery = '';
    this.view = 'browse';
  }

  selectSeriesGroup(group: SeriesGroup) {
    this.selectedSeriesGroup = group;
    this.displaySeries = [...group.series];
    this.selectedSeries = null;
    this.searchQuery = '';
    this.view = 'browse';
  }

  /** Clica num cartaz → abre tela de episódios */
  selectSeries(series: Series) {
    this.selectedSeries = series;
    this.searchQuery = '';
    this.view = 'episodes';
  }

  // ─── Busca ───────────────────────────────────────────────────────────────────

  get filteredSidebarGroups(): SeriesGroup[] {
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
    for (let i = 0; i < series.length; i += POSTERS_PER_ROW) {
      rows.push(series.slice(i, i + POSTERS_PER_ROW));
    }
    return rows;
  }

  onSeriesScrolled(_: number) { }

  // ─── Getters de episódios ─────────────────────────────────────────────────────

  get selectedSeriesName(): string { return this.selectedSeries?.name ?? ''; }

  get allEpisodesOfSelectedSeries(): EpisodeFlat[] {
    if (!this.selectedSeries) return [];
    const eps: EpisodeFlat[] = [];
    this.selectedSeries.seasons.forEach(s =>
      s.episodes.forEach(e => eps.push({ ...e, seriesName: this.selectedSeries!.name }))
    );
    return eps.sort((a, b) => a.episode - b.episode);
  }

  get filteredEpisodes(): EpisodeFlat[] {
    return this.allEpisodesOfSelectedSeries.map((e, i) => ({ ...e, epIndex: i + 1 }));
  }

  get totalEpisodes(): number { return this.allEpisodesOfSelectedSeries.length; }

  // ─── Player ───────────────────────────────────────────────────────────────────

  playEpisode(ep: EpisodeFlat) {
    if (!ep) return;
    this.selectedEpisode = ep;
    this.playerError = '';
    this.retryCount = 0;
    this.view = 'player';
    setTimeout(() => this.playItem(ep), 100);
  }

  closePlayer() {
    this.destroyPlayer();
    this.view = 'episodes';   // volta para a tela de episódios
    this.selectedEpisode = null;
  }

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

  async playItem(item: EpisodeFlat) {
    this.destroyPlayer();
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;
    this.isPlaying = false; this.isBuffering = true; this.playerError = '';
    this.cdr.detectChanges();
    const url = item.url.trim();
    const isHls = url.includes('.m3u8') || url.includes('/hls/');
    isHls ? this.tryPlayHls(video, url) : this.tryPlayNative(video, url);
  }

  tryPlayHls(video: HTMLVideoElement, url: string) {
    const HlsLib = (window as any).Hls;
    if (!HlsLib) {
      setTimeout(() => (window as any).Hls ? this.tryPlayHls(video, url) : this.tryPlayNative(video, url), 1000);
      return;
    }
    if (!HlsLib.isSupported()) { this.tryPlayNative(video, url); return; }

    this.hls = new HlsLib(HLS_CONFIG);
    this.hls.loadSource(url);
    this.hls.attachMedia(video);

    this.hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
      video.play()
        .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
        .catch(() => { video.muted = true; video.play().then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); }); });
    });

    this.hls.on(HlsLib.Events.ERROR, (_: any, data: any) => {
      if (!data.fatal) return;
      if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.retryTimeout = setTimeout(() => this.hls?.startLoad(), 2000 * this.retryCount);
      } else { this.hls?.destroy(); this.hls = null; this.tryPlayNative(video, url); }
    });

    video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.detectChanges(); });
    video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.detectChanges(); });
    video.addEventListener('timeupdate', () => this.updateProgress(video));
  }

  tryPlayNative(video: HTMLVideoElement, url: string) {
    video.src = url; video.load();
    video.addEventListener('canplay', () => {
      video.play()
        .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
        .catch(() => { video.muted = true; video.play().then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); }); });
    });
    video.addEventListener('error', () => this.showError('Não foi possível reproduzir este episódio.'));
    video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.detectChanges(); });
    video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.detectChanges(); });
    video.addEventListener('timeupdate', () => this.updateProgress(video));
  }

  updateProgress(video: HTMLVideoElement) {
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
      return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };
    this.videoCurrentTime = fmt(video.currentTime);
    this.duration = isFinite(video.duration) ? fmt(video.duration) : '--:--';
    this.cdr.detectChanges();
  }

  showError(msg: string) {
    this.playerError = msg; this.isPlaying = false; this.isBuffering = false;
    this.cdr.detectChanges();
  }

  destroyPlayer() {
    if (this.retryTimeout) { clearTimeout(this.retryTimeout); this.retryTimeout = null; }
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    const v = this.videoPlayerRef?.nativeElement;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    this.isPlaying = false; this.isBuffering = false;
  }

  togglePlay() {
    const v = this.videoPlayerRef?.nativeElement; if (!v) return;
    v.paused
      ? v.play().then(() => { this.isPlaying = true; this.cdr.detectChanges(); })
      : (v.pause(), this.isPlaying = false, this.cdr.detectChanges());
  }

  toggleMute() {
    const v = this.videoPlayerRef?.nativeElement; if (!v) return;
    this.isMuted = !this.isMuted; v.muted = this.isMuted;
  }

  setVolume(event: Event) {
    this.volume = +(event.target as HTMLInputElement).value;
    const v = this.videoPlayerRef?.nativeElement;
    if (v) { v.volume = this.volume / 100; this.isMuted = this.volume === 0; }
  }

  seek(event: Event) {
    const v = this.videoPlayerRef?.nativeElement;
    const val = +(event.target as HTMLInputElement).value;
    if (v && isFinite(v.duration)) v.currentTime = (val / 100) * v.duration;
  }

  get progressPercent(): number {
    const v = this.videoPlayerRef?.nativeElement;
    if (!v || !isFinite(v.duration) || v.duration === 0) return 0;
    return (v.currentTime / v.duration) * 100;
  }

  // ─── TrackBy helpers ──────────────────────────────────────────────────────────

  trackByIdx(_: number, __: any) { return _; }
  trackBySeriesName(_: number, s: Series) { return s.name; }
  trackByEpId(_: number, e: EpisodeFlat) { return e.id; }
}