import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild
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
import { HLS_CONFIG } from '../../models/hls.config';
import { PlayerService } from '../../services/player-service';

// ── Tipos para o virtual scroll por linhas ─────────────
export interface MovieRow {
  index: number;           // índice da linha (para trackBy)
  items: Channel[];        // cartazes da linha
  ghosts: null[];          // células vazias para completar a última linha
}

// ── Constantes de layout (ajuste conforme resolução da TV) ─
const CARD_WIDTH = 160; // px — largura fixa do cartão
const CARD_HEIGHT = 290; // px — altura do cartão (poster 2:3 + label)
const GAP = 18;  // px — gap entre cartões
const ROW_PADDING = 28;  // px — padding lateral da área de conteúdo

@Component({
  selector: 'app-movies',
  templateUrl: './movies.html',
  styleUrl: './movies.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,          // OnPush ativado
  imports: [CommonModule, FormsModule, NavbarComponent, ScrollingModule]
})
export class MoviesComponent implements OnInit, OnDestroy {

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;
  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;

  // ── Dados
  groups: ChannelGroup[] = [];
  selectedGroup: ChannelGroup | null = null;
  selectedMovie: Channel | null = null;
  searchQuery: string = '';

  // ── Virtual scroll
  movieRows: MovieRow[] = [];
  rowHeight = CARD_HEIGHT + GAP;   // altura total de cada linha renderizada pelo CDK
  private colsCount = 6;           // calculado no resize

  // ── Player
  isPlaying = false;
  isBuffering = false;
  playerError = '';
  volume = 80;
  isMuted = false;
  currentTime = '00:00';
  duration = '00:00';

  private hls: any = null;
  private retryTimeout: any;
  private retryCount = 0;
  private readonly MAX_RETRIES = 3;
  private clockInterval: any;

  // ── Streams RxJS
  private destroy$ = new Subject<void>();
  private search$ = new Subject<string>();

  constructor(
    private router: Router,
    private iptv: IptvService,
    private cdr: ChangeDetectorRef,
    private playerService: PlayerService
  ) { }

  // ── Lifecycle ──────────────────────────────────────────

  async ngOnInit() {
    await this.iptv.reloadm3u('movie');
    this.groups = this.iptv.getGroupsByType('movie');
    this.playerService.preloadHls();
    this.startClock();
    this.calcCols();

    // Debounce na busca: aguarda 300 ms após o usuário parar de digitar
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

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyPlayer();
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
  }

  // ── Responsividade: recalcula colunas ao redimensionar ──
  @HostListener('window:resize')
  onResize() {
    this.calcCols();
    this.rebuildRows();
    this.cdr.markForCheck();
  }

  private calcCols() {
    // Largura disponível = viewport - sidebar (270px) - padding (2x)
    const available = window.innerWidth - 270 - ROW_PADDING * 2;
    this.colsCount = Math.max(2, Math.floor((available + GAP) / (CARD_WIDTH + GAP)));
  }

  // ── Grid: agrupa filmes em linhas de colsCount ───────────
  private rebuildRows() {
    const movies = this.filteredMovies;
    const cols = this.colsCount;
    const rows: MovieRow[] = [];

    for (let i = 0; i < movies.length; i += cols) {
      const slice = movies.slice(i, i + cols);
      const ghosts = slice.length < cols
        ? new Array(cols - slice.length).fill(null)
        : [];
      rows.push({ index: i / cols, items: slice, ghosts });
    }

    this.movieRows = rows;
  }

  // ── trackBy functions ────────────────────────────────────
  trackByGroup(_: number, g: ChannelGroup) { return g.name; }
  trackByRow(_: number, r: MovieRow) { return r.index; }
  trackByMovie(_: number, m: Channel) { return m.id ?? m.url; }

  // ── Dados filtrados ──────────────────────────────────────
  get filteredMovies(): Channel[] {
    if (!this.selectedGroup) return [];
    if (!this.searchQuery) return this.selectedGroup.channels;
    const q = this.searchQuery.toLowerCase();
    return this.selectedGroup.channels.filter(c => c.name.toLowerCase().includes(q));
  }

  get totalMovies(): number { return this.iptv.getCount('movie'); }

  // ── Ações da sidebar ────────────────────────────────────
  selectGroup(group: ChannelGroup) {
    this.selectedGroup = group;
    this.searchQuery = '';
    this.rebuildRows();
    this.cdr.markForCheck();
    // Volta ao topo após o Angular renderizar as novas linhas
    setTimeout(() => this.viewport?.scrollToIndex(0, 'instant'), 0);
  }

  onSearchInput(value: string) {
    this.search$.next(value);
  }

  // ── Seleção do filme ────────────────────────────────────
  selectMovie(movie: Channel) {
    this.selectedMovie = movie;
    this.playerError = '';
    this.retryCount = 0;
    this.cdr.markForCheck();
    setTimeout(() => this.playItem(movie), 100);
  }

  closePlayer() {
    this.destroyPlayer();
    this.selectedMovie = null;
    this.duration = '00:00';
    this.cdr.markForCheck();
  }

  closePlayerIfBackdrop(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('player-fullscreen')) {
      this.closePlayer();
    }
  }

  // ── Relógio ─────────────────────────────────────────────
  private startClock() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  private updateClock() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.cdr.markForCheck();
  }

  // ── Player ───────────────────────────────────────────────

  async playItem(item: Channel) {
    this.destroyPlayer();
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;

    this.isPlaying = false;
    this.isBuffering = true;
    this.playerError = '';
    this.cdr.markForCheck();

    const url = item.url.trim();
    const isHls = url.includes('.m3u8') || url.includes('/hls/');
    isHls ? this.tryPlayHls(video, url) : this.tryPlayNative(video, url);
  }

  /** Botão "Tentar novamente" na tela de erro */
  retryCurrentMovie() {
    if (this.selectedMovie) {
      this.retryCount = 0;
      this.playItem(this.selectedMovie);
    }
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
      this.doPlay(video);
    });

    this.hls.on(HlsLib.Events.ERROR, (_: any, data: any) => {
      if (!data.fatal) return;
      if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.showRetrying();
        this.retryTimeout = setTimeout(() => this.hls?.startLoad(), 2000 * this.retryCount);
      } else {
        this.hls?.destroy(); this.hls = null;
        this.tryPlayNative(video, url);
      }
    });

    this.attachVideoEvents(video);
  }

  tryPlayNative(video: HTMLVideoElement, url: string) {
    video.src = url;
    video.load();

    video.addEventListener('canplay', () => this.doPlay(video), { once: true });

    video.addEventListener('error', () => {
      const err = video.error;
      const code = err?.code ?? -1;

      // Retry automático para erros de rede / servidor (502, timeout, etc.)
      if (code === MediaError.MEDIA_ERR_NETWORK && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.showRetrying();
        this.retryTimeout = setTimeout(() => { video.load(); }, 2000 * this.retryCount);
        return;
      }

      // Sem mais retries — mensagem específica por código
      switch (code) {
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          this.showError('Formato não suportado neste dispositivo.\nTente novamente ou escolha outro filme.');
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          this.showError('Erro de rede — servidor indisponível (502).\nTente novamente.');
          break;
        case MediaError.MEDIA_ERR_DECODE:
          this.showError('Erro ao decodificar o vídeo.\nTente novamente.');
          break;
        default:
          this.showError('Não foi possível reproduzir este filme.\nTente novamente.');
      }
    });

    this.attachVideoEvents(video);
  }

  private doPlay(video: HTMLVideoElement) {
    video.play()
      .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.markForCheck(); })
      .catch(() => {
        video.muted = true;
        video.play()
          .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.markForCheck(); })
          .catch(() => this.showError('Não foi possível iniciar a reprodução.'));
      });
  }

  private attachVideoEvents(video: HTMLVideoElement) {
    video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.markForCheck(); });
    video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.markForCheck(); });
    video.addEventListener('timeupdate', () => this.updateProgress(video));
  }

  private showRetrying() {
    this.playerError = `Reconectando... (${this.retryCount}/${this.MAX_RETRIES})`;
    this.isBuffering = true;
    this.cdr.markForCheck();
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
    this.currentTime = fmt(video.currentTime);
    this.duration = isFinite(video.duration) ? fmt(video.duration) : '--:--';
    this.cdr.markForCheck();
  }

  showError(msg: string) {
    this.playerError = msg; this.isPlaying = false; this.isBuffering = false;
    this.cdr.markForCheck();
  }

  destroyPlayer() {
    if (this.retryTimeout) { clearTimeout(this.retryTimeout); this.retryTimeout = null; }
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    if (this.videoPlayerRef?.nativeElement) {
      const v = this.videoPlayerRef.nativeElement;
      v.pause(); v.removeAttribute('src'); v.load();
    }
    this.isPlaying = false; this.isBuffering = false;
  }

  togglePlay() {
    const v = this.videoPlayerRef?.nativeElement; if (!v) return;
    v.paused
      ? v.play().then(() => { this.isPlaying = true; this.cdr.markForCheck(); })
      : (v.pause(), this.isPlaying = false, this.cdr.markForCheck());
  }

  toggleMute() {
    const v = this.videoPlayerRef?.nativeElement; if (!v) return;
    this.isMuted = !this.isMuted; v.muted = this.isMuted;
    this.cdr.markForCheck();
  }

  setVolume(event: Event) {
    this.volume = +(event.target as HTMLInputElement).value;
    const v = this.videoPlayerRef?.nativeElement;
    if (v) { v.volume = this.volume / 100; this.isMuted = this.volume === 0; }
    this.cdr.markForCheck();
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
}