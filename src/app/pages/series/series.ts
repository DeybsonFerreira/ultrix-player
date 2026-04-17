import {
  ChangeDetectorRef, Component, OnInit, OnDestroy,
  ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { HLS_CONFIG } from '../../models/hls.config';
import { PlayerService } from '../../services/player-service';
import { EpisodeFlat, Series, SeriesGroup } from '../../models/serie';



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

  // ── Navegação: 'groups' | 'series' | 'episodes' | 'player'
  view: 'groups' | 'series' | 'episodes' | 'player' = 'groups';

  // ── Dados brutos da playlist
  allSeriesGroups: SeriesGroup[] = [];

  // ── Grupo selecionado (ex: "AMAZON PRIME VIDEO")
  selectedSeriesGroup: SeriesGroup | null = null;

  // ── Séries do grupo selecionado com busca aplicada
  displaySeries: Series[] = [];

  // ── Série selecionada (cartaz clicado)
  selectedSeries: Series | null = null;

  // ── Episódio em reprodução
  selectedEpisode: EpisodeFlat | null = null;

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

  // ─── Carregamento de dados ────────────────────────────────────────────────

  private loadSeriesGroups() {
    // Suponha que este método retorna os grupos de séries
    // Você precisa adaptá-lo ao seu serviço IptvService
    this.allSeriesGroups = this.buildSeriesGroups();
  }

  /**
   * Constrói a estrutura de SeriesGroup a partir dos dados do serviço
   * Adapte conforme sua fonte de dados (M3U, API, etc)
   */
  private buildSeriesGroups(): SeriesGroup[] {
    // Exemplo: obtém todos os canais do tipo série
    const channels = this.iptv.getGroupsByType("series"); // Ajuste conforme seu serviço

    const groupMap = new Map<string, Series[]>();

    // Agrupa canais em séries por título
    channels.forEach(group => {
      group.channels.forEach(channel => {
        const seriesTitle = this.extractSeriesTitle(channel.name);
        const groupName = group.name;

        if (!groupMap.has(groupName)) {
          groupMap.set(groupName, []);
        }

        // Encontra ou cria série no grupo
        let series = groupMap.get(groupName)!.find(s => s.name === seriesTitle);
        if (!series) {
          series = {
            name: seriesTitle,
            seasons: [],
            group: groupName,
            logo: channel.logo
          };
          groupMap.get(groupName)!.push(series);
        }

        // Extrai season/episode do nome do canal
        const { season, episode } = this.extractSeasonEpisode(channel.name);

        // Encontra ou cria temporada
        let seasonData = series.seasons.find(s => s.season === season);
        if (!seasonData) {
          seasonData = { season, episodes: [] };
          series.seasons.push(seasonData);
        }

        // Adiciona episódio
        seasonData.episodes.push({
          name: channel.name,
          url: channel.url,
          episode: episode,
          logo: channel.logo,
          id: channel.id,
          group: groupName
        });
      });
    });

    // Converte para array de SeriesGroup
    const result: SeriesGroup[] = Array.from(groupMap.entries()).map(([groupName, series]) => ({
      name: groupName,
      series: series.sort((a, b) => a.name.localeCompare(b.name))
    }));

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  getEpisodeCount(serie: Series): number {
    return serie.seasons.reduce((total, season) => {
      return total + season.episodes.length;
    }, 0);
  }
  /**
   * Extrai o título da série removendo padrões de episódio.
   * Ex: "Breaking Bad S03E07" → "Breaking Bad"
   */
  private extractSeriesTitle(name: string): string {
    const cleaned = name
      .replace(/\s*[Ss]\d{1,2}[Ee]\d{1,3}.*/g, '')
      .replace(/\s*\d{1,2}[Xx]\d{1,2}.*/g, '')
      .replace(/\s*[Tt]\d{1,2}\s*[Ee]\d{1,3}.*/g, '')
      .replace(/\s*[Ee][Pp]\s*\d+.*/g, '')
      .replace(/\s*[-–—]\s*[Ee]pisódio.*/gi, '')
      .trim();

    return cleaned || name.trim();
  }

  /**
   * Extrai season e episode do nome
   * Ex: "Breaking Bad S03E07" → { season: 3, episode: 7 }
   */
  private extractSeasonEpisode(name: string): { season: number; episode: number } {
    let season = 1;
    let episode = 1;

    // Padrão S##E##
    const match1 = name.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
    if (match1) {
      season = parseInt(match1[1], 10);
      episode = parseInt(match1[2], 10);
      return { season, episode };
    }

    // Padrão ##x##
    const match2 = name.match(/(\d{1,2})[Xx](\d{1,2})/);
    if (match2) {
      season = parseInt(match2[1], 10);
      episode = parseInt(match2[2], 10);
      return { season, episode };
    }

    return { season, episode };
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

  goHome() {
    this.router.navigate(['/']);
  }

  onGlobalSearch(q: string) {
    this.searchQuery = q;
  }

  backToGroups() {
    this.view = 'groups';
    this.selectedSeriesGroup = null;
    this.selectedSeries = null;
    this.searchQuery = '';
  }

  backToSeries() {
    this.view = 'series';
    this.selectedSeries = null;
    this.searchQuery = '';
  }

  // ─── Grupos / Categorias ──────────────────────────────────────────────────

  get filteredSeriesGroups(): SeriesGroup[] {
    if (!this.searchQuery) return this.allSeriesGroups;
    const q = this.searchQuery.toLowerCase();
    return this.allSeriesGroups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.series.some(s => s.name.toLowerCase().includes(q))
    );
  }

  selectSeriesGroup(group: SeriesGroup) {
    this.selectedSeriesGroup = group;
    this.displaySeries = [...group.series];
    this.view = 'series';
    this.searchQuery = '';
  }

  // ─── Grid de séries (cartazes) ────────────────────────────────────────────

  get filteredDisplaySeries(): Series[] {
    if (!this.searchQuery) return this.displaySeries;
    const q = this.searchQuery.toLowerCase();
    return this.displaySeries.filter(s => s.name.toLowerCase().includes(q));
  }

  /** Divide as séries em linhas de N itens para o CDK Virtual Scroll */
  get seriesPosterRows(): Series[][] {
    const series = this.filteredDisplaySeries;
    const rows: Series[][] = [];
    for (let i = 0; i < series.length; i += POSTERS_PER_ROW) {
      rows.push(series.slice(i, i + POSTERS_PER_ROW));
    }
    return rows;
  }

  onSeriesScrolled(_idx: number) { /* pode usar para pré-carregar imagens */ }

  // ─── Seleção de série → episódios ─────────────────────────────────────────

  selectSeries(series: Series) {
    this.selectedSeries = series;
    this.view = 'episodes';
    this.searchQuery = '';
  }

  get selectedSeriesName(): string {
    return this.selectedSeries?.name ?? '';
  }

  get allEpisodesOfSelectedSeries(): EpisodeFlat[] {
    if (!this.selectedSeries) return [];

    const episodes: EpisodeFlat[] = [];

    // Achatamos as temporadas em uma lista flat de episódios
    this.selectedSeries.seasons.forEach(season => {
      season.episodes.forEach(ep => {
        episodes.push({
          ...ep,
          seriesName: this.selectedSeries!.name
        });
      });
    });

    // Ordena por temporada e episódio
    return episodes.sort((a, b) => {
      const seasonA = a.episode; // Você pode querer extrair season também
      const seasonB = b.episode;
      return seasonA - seasonB;
    });
  }

  get filteredEpisodes(): EpisodeFlat[] {
    let episodes = this.allEpisodesOfSelectedSeries;

    if (!this.searchQuery) {
      return episodes.map((e, i) => ({ ...e, epIndex: i + 1 }));
    }

    const q = this.searchQuery.toLowerCase();
    return episodes
      .filter(e => e.name.toLowerCase().includes(q))
      .map((e, i) => ({ ...e, epIndex: i + 1 }));
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  playEpisode(ep: EpisodeFlat) {
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

  get totalEpisodes(): number {
    return this.allEpisodesOfSelectedSeries.length;
  }

  // ─── TrackBy helpers ──────────────────────────────────────────────────────

  trackByIdx(_: number, __: any) { return _; }
  trackBySeriesName(_: number, s: Series) { return s.name; }
  trackByEpId(_: number, e: EpisodeFlat) { return e.id; }
}