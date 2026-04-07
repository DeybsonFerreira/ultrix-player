import { ChangeDetectorRef, Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChannelGroup } from '../../models/channelGroup';
import { Channel } from '../../models/channel';
import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { CacheKeys } from '../../models/constants';

const HLS_CONFIG = {
  maxBufferLength: 60,
  maxMaxBufferLength: 600,
  maxBufferSize: 60 * 1000 * 1000,
  manifestLoadingMaxRetry: 6,
  manifestLoadingRetryDelay: 1000,
  levelLoadingMaxRetry: 6,
  levelLoadingRetryDelay: 1000,
  fragLoadingMaxRetry: 6,
  fragLoadingRetryDelay: 1000,
  xhrSetup: (xhr: XMLHttpRequest, _url: string) => { xhr.withCredentials = false; },
  enableWorker: false,
  debug: false,
};

@Component({
  selector: 'app-series',
  templateUrl: './series.html',
  styleUrl: './series.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent]
})
export class SeriesComponent implements OnInit, OnDestroy {

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  // ── Dados (apenas séries)
  groups: ChannelGroup[] = [];
  selectedGroup: ChannelGroup | null = null;
  selectedEpisode: Channel | null = null;
  searchQuery: string = '';
  sidebarMode: 'groups' | 'channels' = 'groups';

  // ── Player
  isPlaying: boolean = false;
  isBuffering: boolean = false;
  playerError: string = '';
  volume: number = 80;
  isMuted: boolean = false;
  currentTime: string = '00:00';
  duration: string = '00:00';

  private hls: any = null;
  private retryTimeout: any;
  private retryCount = 0;
  private readonly MAX_RETRIES = 3;
  private clockInterval: any;

  constructor(
    private router: Router,
    private iptv: IptvService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (!this.iptv.isLoaded) this.iptv.loadFromStorage(CacheKeys.IPTV_LINK);
    // Carrega apenas grupos classificados como 'series'
    this.groups = this.iptv.getGroupsByType('series');
    this.preloadHls();
    this.startClock();
  }

  ngOnDestroy(): void {
    this.destroyPlayer();
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
  }

  startClock() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.cdr.detectChanges();
  }

  goHome() { this.router.navigate(['/']); }

  get filteredEpisodes(): Channel[] {
    if (!this.selectedGroup) return [];
    if (!this.searchQuery) return this.selectedGroup.channels;
    const q = this.searchQuery.toLowerCase();
    return this.selectedGroup.channels.filter(c => c.name.toLowerCase().includes(q));
  }

  get totalSeries(): number { return this.iptv.getCount('series'); }

  selectGroup(group: ChannelGroup) {
    this.selectedGroup = group;
    this.sidebarMode = 'channels';
    this.searchQuery = '';
  }

  backToGroups() {
    this.sidebarMode = 'groups';
    this.selectedGroup = null;
    this.searchQuery = '';
  }

  selectEpisode(episode: Channel) {
    this.selectedEpisode = episode;
    this.playerError = '';
    this.retryCount = 0;
    setTimeout(() => this.playItem(episode), 100);
  }

  nextEpisode() {
    const list = this.filteredEpisodes;
    const idx = list.findIndex(e => e.id === this.selectedEpisode?.id);
    if (idx < list.length - 1) this.selectEpisode(list[idx + 1]);
  }

  prevEpisode() {
    const list = this.filteredEpisodes;
    const idx = list.findIndex(e => e.id === this.selectedEpisode?.id);
    if (idx > 0) this.selectEpisode(list[idx - 1]);
  }

  // ─── Player ────────────────────────────────────────────────────────────
  preloadHls() {
    if ((window as any).Hls) return;
    const script = document.createElement('script');
    script.src = 'assets/hls.min.js';
    script.onerror = () => {
      const cdn = document.createElement('script');
      cdn.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
      document.head.appendChild(cdn);
    };
    document.head.appendChild(script);
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
    video.addEventListener('timeupdate', () => { this.updateProgress(video); });
  }

  tryPlayNative(video: HTMLVideoElement, url: string) {
    video.src = url; video.load();
    video.addEventListener('canplay', () => {
      video.play().then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); }).catch(() => { video.muted = true; video.play().then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); }); });
    });
    video.addEventListener('error', () => { this.showError('Não foi possível reproduzir este episódio.'); });
    video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.detectChanges(); });
    video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.detectChanges(); });
    video.addEventListener('timeupdate', () => { this.updateProgress(video); });
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
    this.cdr.detectChanges();
  }

  showError(msg: string) {
    this.playerError = msg; this.isPlaying = false; this.isBuffering = false; this.cdr.detectChanges();
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
    v.paused ? v.play().then(() => { this.isPlaying = true; this.cdr.detectChanges(); }) : (v.pause(), this.isPlaying = false);
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
}
