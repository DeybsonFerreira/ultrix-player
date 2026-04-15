import {
  ChangeDetectorRef, Component, OnInit, OnDestroy,
  ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { ChannelGroup } from '../../models/channelGroup';
import { Channel } from '../../models/channel';
import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { HLS_CONFIG } from '../../models/hls.config';
import { PlayerService } from '../../services/player-service';

// ─── Tipos auxiliares ────────────────────────────────────────────────────────

/** Representa uma "série" agrupada por título (ex: "Todo Mundo Odeia o Chris") */
export interface SeriesGroup {
  title: string;          // Título extraído do nome do episódio
  logo: string;           // Logo do primeiro episódio
  episodes: Channel[];    // Lista completa de episódios
}

// ─── Constantes de layout ─────────────────────────────────────────────────────

const POSTERS_PER_ROW = 5;
export const POSTER_ROW_HEIGHT = 300;  // px — altura de cada linha de cartazes
export const EP_ITEM_HEIGHT = 72;       // px — altura de cada item de episódio

// ─── Componente ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-series',
  templateUrl: './series.html',
  styleUrl: './series.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, ScrollingModule]
})
export class SeriesComponent implements OnInit, OnDestroy {

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  // ── Constantes expostas ao template
  readonly POSTER_ROW_HEIGHT = POSTER_ROW_HEIGHT;
  readonly EP_ITEM_HEIGHT = EP_ITEM_HEIGHT;

  // ── Navegação: 'categories' | 'posters' | 'episodes' | 'player'
  view: 'categories' | 'posters' | 'episodes' | 'player' = 'categories';

  // ── Dados brutos da playlist
  groups: ChannelGroup[] = [];

  // ── Grupo selecionado (ex: "S • AMAZON PRIME VIDEO")
  selectedGroup: ChannelGroup | null = null;

  // ── Séries agrupadas por título dentro do grupo selecionado
  seriesInGroup: SeriesGroup[] = [];

  // ── Série selecionada (cartaz clicado)
  selectedSeriesGroup: SeriesGroup | null = null;

  // ── Episódio em reprodução
  selectedEpisode: Channel | null = null;

  // ── Busca
  searchQuery: string = '';

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

  // ── Controle de episódio anterior (para voltar do player)
  private previousView: 'episodes' = 'episodes';

  constructor(
    private router: Router,
    private iptv: IptvService,
    private cdr: ChangeDetectorRef,
    private playerService: PlayerService
  ) { }

  async ngOnInit() {
    await this.iptv.reloadm3u('series');
    this.groups = this.iptv.getGroupsByType('series');
    this.playerService.preloadHls();
    this.startClock();
  }

  ngOnDestroy() {
    this.destroyPlayer();
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
  }

  // ─── Clock ────────────────────────────────────────────────────────────────

  startClock() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    this.currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.cdr.detectChanges();
  }

  // ─── Navegação ────────────────────────────────────────────────────────────

  goHome() { this.router.navigate(['/']); }

  onGlobalSearch(q: string) { this.searchQuery = q; }

  backToCategories() {
    this.view = 'categories';
    this.selectedGroup = null;
    this.selectedSeriesGroup = null;
    this.searchQuery = '';
  }

  backToPosters() {
    this.view = 'posters';
    this.selectedSeriesGroup = null;
    this.searchQuery = '';
  }

  // ─── Grupos / Categorias ──────────────────────────────────────────────────

  get filteredGroups(): ChannelGroup[] {
    if (!this.searchQuery) return this.groups;
    const q = this.searchQuery.toLowerCase();
    return this.groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.channels.some(c => c.name.toLowerCase().includes(q))
    );
  }

  selectGroup(group: ChannelGroup) {
    this.selectedGroup = group;
    this.seriesInGroup = this.buildSeriesGroups(group.channels);
    this.view = 'posters';
    this.searchQuery = '';
  }

  // ─── Séries agrupadas por título (cartazes) ───────────────────────────────

  /**
   * Agrupa episódios por título de série.
   * Extrai o título base antes do padrão SxxExx ou S01E01 etc.
   * Ex: "Todo Mundo Odeia o Chris S01E01" → título = "Todo Mundo Odeia o Chris"
   */
  private buildSeriesGroups(channels: Channel[]): SeriesGroup[] {
    const map = new Map<string, SeriesGroup>();

    for (const ch of channels) {
      const title = this.extractSeriesTitle(ch.name);
      if (!map.has(title)) {
        map.set(title, { title, logo: ch.logo || '', episodes: [] });
      }
      map.get(title)!.episodes.push(ch);
    }

    // Ordena episódios internamente por nome
    for (const sg of map.values()) {
      sg.episodes.sort((a, b) => a.name.localeCompare(b.name));
    }

    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Extrai o título da série removendo padrões de episódio.
   * Ex: "Breaking Bad S03E07" → "Breaking Bad"
   */
  private extractSeriesTitle(name: string): string {
    // Remove SxxExx, S01E01, 1x01, T01 E01, EP01, etc.
    const cleaned = name
      .replace(/\s*[Ss]\d{1,2}[Ee]\d{1,3}.*/g, '')  // S01E01 e depois
      .replace(/\s*\d{1,2}[Xx]\d{1,2}.*/g, '')       // 1x01
      .replace(/\s*[Tt]\d{1,2}\s*[Ee]\d{1,3}.*/g, '') // T01 E01
      .replace(/\s*[Ee][Pp]\s*\d+.*/g, '')             // EP01
      .replace(/\s*[-–—]\s*[Ee]pisódio.*/gi, '')
      .trim();

    return cleaned || name.trim();
  }

  // ─── Grid de cartazes com linhas para o virtual scroll ───────────────────

  get filteredSeries(): SeriesGroup[] {
    if (!this.searchQuery) return this.seriesInGroup;
    const q = this.searchQuery.toLowerCase();
    return this.seriesInGroup.filter(s => s.title.toLowerCase().includes(q));
  }

  /** Divide as séries em linhas de N itens para o CDK Virtual Scroll */
  get posterRows(): SeriesGroup[][] {
    const series = this.filteredSeries;
    const rows: SeriesGroup[][] = [];
    for (let i = 0; i < series.length; i += POSTERS_PER_ROW) {
      rows.push(series.slice(i, i + POSTERS_PER_ROW));
    }
    return rows;
  }

  onPostersScrolled(_idx: number) { /* pode usar para pré-carregar imagens */ }

  // ─── Seleção de série → episódios ─────────────────────────────────────────

  get selectedSeriesTitle(): string {
    return this.selectedSeriesGroup?.title ?? '';
  }

  selectSeries(series: SeriesGroup) {
    this.selectedSeriesGroup = series;
    this.view = 'episodes';
    this.searchQuery = '';
  }

  get filteredEpisodes(): (Channel & { epIndex: number })[] {
    if (!this.selectedSeriesGroup) return [];
    const eps = this.selectedSeriesGroup.episodes;
    const list = this.searchQuery
      ? eps.filter(e => e.name.toLowerCase().includes(this.searchQuery.toLowerCase()))
      : eps;
    return list.map((e, i) => ({ ...e, epIndex: i + 1 }));
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  playEpisode(ep: Channel) {
    this.selectedEpisode = ep;
    this.playerError = '';
    this.retryCount = 0;
    this.view = 'player';
    setTimeout(() => this.playItem(ep), 100);
  }

  closePlayer() {
    this.destroyPlayer();
    this.view = 'episodes';
    this.selectedEpisode = null;
  }

  nextEpisode() {
    if (!this.selectedSeriesGroup || !this.selectedEpisode) return;
    const list = this.selectedSeriesGroup.episodes;
    const idx = list.findIndex(e => e.id === this.selectedEpisode?.id);
    if (idx < list.length - 1) this.playEpisode(list[idx + 1]);
  }

  prevEpisode() {
    if (!this.selectedSeriesGroup || !this.selectedEpisode) return;
    const list = this.selectedSeriesGroup.episodes;
    const idx = list.findIndex(e => e.id === this.selectedEpisode?.id);
    if (idx > 0) this.playEpisode(list[idx - 1]);
  }

  async playItem(item: Channel) {
    this.destroyPlayer();
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;

    this.isPlaying = false;
    this.isBuffering = true;
    this.playerError = '';
    this.cdr.detectChanges();

    const url = item.url.trim();
    const isHls = url.includes('.m3u8') || url.includes('/hls/');
    isHls ? this.tryPlayHls(video, url) : this.tryPlayNative(video, url);
  }

  tryPlayHls(video: HTMLVideoElement, url: string) {
    const HlsLib = (window as any).Hls;
    if (!HlsLib) {
      setTimeout(() => (window as any).Hls
        ? this.tryPlayHls(video, url)
        : this.tryPlayNative(video, url), 1000);
      return;
    }
    if (!HlsLib.isSupported()) { this.tryPlayNative(video, url); return; }

    this.hls = new HlsLib(HLS_CONFIG);
    this.hls.loadSource(url);
    this.hls.attachMedia(video);

    this.hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
      video.play()
        .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
        .catch(() => {
          video.muted = true;
          video.play().then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); });
        });
    });

    this.hls.on(HlsLib.Events.ERROR, (_: any, data: any) => {
      if (!data.fatal) return;
      if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.retryTimeout = setTimeout(() => this.hls?.startLoad(), 2000 * this.retryCount);
      } else {
        this.hls?.destroy(); this.hls = null;
        this.tryPlayNative(video, url);
      }
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
        .catch(() => {
          video.muted = true;
          video.play().then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); });
        });
    });
    video.addEventListener('error', () => this.showError('Não foi possível reproduzir este episódio.'));
    video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.detectChanges(); });
    video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.detectChanges(); });
    video.addEventListener('timeupdate', () => this.updateProgress(video));
  }

  updateProgress(video: HTMLVideoElement) {
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
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

  get totalSeries(): number { return this.iptv.getCount('series'); }

  // ─── TrackBy helpers ──────────────────────────────────────────────────────

  trackByIdx(_: number, __: any) { return _; }
  trackBySeriesTitle(_: number, s: SeriesGroup) { return s.title; }
  trackByEpId(_: number, e: Channel) { return e.id; }
}