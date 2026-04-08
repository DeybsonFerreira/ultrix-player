import { ChangeDetectorRef, Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChannelGroup } from '../../models/channelGroup';
import { Channel } from '../../models/channel';
import { IptvService } from '../../services/iptv-service';
import { NavbarComponent } from '../../components/navbar/navbar';
import { HLS_CONFIG } from '../../models/hls.config';
import { PlayerService } from '../../services/player-service';

@Component({
  selector: 'app-movies',
  templateUrl: './movies.html',
  styleUrl: './movies.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent]
})
export class MoviesComponent implements OnInit, OnDestroy {

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  // ── Dados (apenas filmes)
  groups: ChannelGroup[] = [];
  selectedGroup: ChannelGroup | null = null;
  selectedMovie: Channel | null = null;
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
    private cdr: ChangeDetectorRef,
    private playerService: PlayerService
  ) { }

  async ngOnInit() {
    await this.iptv.reloadm3u();
    this.groups = this.iptv.getGroupsByType('movie');
    this.playerService.preloadHls();
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

  get filteredMovies(): Channel[] {
    if (!this.selectedGroup) return [];
    if (!this.searchQuery) return this.selectedGroup.channels;
    const q = this.searchQuery.toLowerCase();
    return this.selectedGroup.channels.filter(c => c.name.toLowerCase().includes(q));
  }

  get totalMovies(): number { return this.iptv.getCount('movie'); }

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

  selectMovie(movie: Channel) {
    this.selectedMovie = movie;
    this.playerError = '';
    this.retryCount = 0;
    setTimeout(() => this.playItem(movie), 100);
  }

  // ─── Player ────────────────────────────────────────────────────────────

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
    video.addEventListener('error', () => { this.showError('Não foi possível reproduzir este filme.'); });
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
