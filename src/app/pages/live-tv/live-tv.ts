import { ChangeDetectorRef, Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar';
import { Channel } from '../../models/channel';
import { ChannelGroup } from '../../models/channelGroup';
import { IptvService } from '../../services/iptv-service';
import { CacheKeys } from '../../models/constants';


// ─── Configuração HLS para WebView/APK ─────────────────
// Parâmetros mais tolerantes a latência e erros de rede na TV
const HLS_CONFIG = {
  maxBufferLength: 60,
  maxMaxBufferLength: 600,
  maxBufferSize: 60 * 1000 * 1000,   // 60 MB

  // Retry agressivo — essencial para streams de TV que dropam pacotes
  manifestLoadingMaxRetry: 6,
  manifestLoadingRetryDelay: 1000,
  manifestLoadingMaxRetryTimeout: 8000,
  levelLoadingMaxRetry: 6,
  levelLoadingRetryDelay: 1000,
  fragLoadingMaxRetry: 6,
  fragLoadingRetryDelay: 1000,

  // Sem credenciais — deixa a WebView gerenciar os headers nativos
  xhrSetup: (xhr: XMLHttpRequest, _url: string) => {
    xhr.withCredentials = false;
  },

  // Worker pode falhar em WebView Android — desabilitar é mais seguro
  enableWorker: false,
  debug: false,
};

@Component({
  selector: 'app-live-tv',
  templateUrl: './live-tv.html',
  styleUrl: './live-tv.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent]
})
export class LiveTvComponent implements OnInit, OnDestroy {

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  // Estado da UI
  sidebarMode: 'groups' | 'channels' = 'groups';

  // Dados
  allChannels: Channel[] = [];
  groups: ChannelGroup[] = [];
  selectedGroup: ChannelGroup | null = null;
  selectedChannel: Channel | null = null;
  searchQuery: string = '';


  // Player
  isPlaying: boolean = false;
  isBuffering: boolean = false;
  playerError: string = '';
  currentTime: string = '00:00';
  volume: number = 80;
  isMuted: boolean = false;

  private hls: any = null;
  private clockInterval: any;
  private retryTimeout: any;
  private retryCount: number = 0;
  private readonly MAX_RETRIES = 3;

  constructor(
    private router: Router,
    private iptv: IptvService,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit(): Promise<void> {

    if (!this.iptv.isLoaded) this.iptv.loadFromStorage(CacheKeys.IPTV_LINK);

    this.loadLiveGroups();
    this.preloadHls();
    this.startClock();
  }

  ngOnDestroy(): void {
    this.destroyPlayer();
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
  }

  // ─── Carrega apenas os grupos de TV AO VIVO ────────────────────────────
  loadLiveGroups() {
    this.groups = this.iptv.getGroupsByType('live');
    this.allChannels = this.iptv.getByType('live');
  }

  // ─── RELÓGIO ───────────────────────────────────────────
  startClock() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.cdr.detectChanges();
  }

  // ─── NAVEGAÇÃO ─────────────────────────────────────────
  goHome() {
    this.router.navigate(['/']);
  }

  clearPlaylist() {
    this.iptv.clearStorage(CacheKeys.IPTV_LINK);
    this.groups = [];
    this.allChannels = [];
    this.selectedGroup = null;
    this.selectedChannel = null;
    this.sidebarMode = 'groups';
    this.destroyPlayer();
    // this.m3uUrl = '';
    // this.importError = '';
    // this.importSuccess = '';
  }

  // ─── SIDEBAR ───────────────────────────────────────────
  get filteredChannels(): Channel[] {
    // Se houver busca, filtra no array mestre (todos os canais)
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      return this.allChannels.filter(c => c.name.toLowerCase().includes(q));
    }
    // Se não houver busca, filtra apenas no grupo selecionado
    return this.selectedGroup ? this.selectedGroup.channels : [];
  }

  get totalLiveChannels(): number { return this.iptv.getCount('live'); }


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

  selectChannel(channel: Channel) {
    this.selectedChannel = channel;
    this.playerError = '';
    this.retryCount = 0;
    setTimeout(() => this.playChannel(channel), 100);
  }

  // ─── PLAYER ────────────────────────────────────────────
  preloadHls() {
    if ((window as any).Hls) return;
    const script = document.createElement('script');
    script.src = 'js/hls.min.js';
    script.onerror = () => {
      const cdn = document.createElement('script');
      cdn.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
      document.head.appendChild(cdn);
    };
    document.head.appendChild(script);
  }

  async playChannel(channel: Channel) {
    this.destroyPlayer();
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;

    this.isPlaying = false;
    this.isBuffering = true;
    this.playerError = '';
    this.cdr.detectChanges();

    const url = channel.url.trim();
    const isHls = url.includes('.m3u8') || url.includes('/hls/') || url.includes('type=m3u_plus');

    isHls ? this.tryPlayHls(video, url) : this.tryPlayNative(video, url);
  }
  // ── Estratégia 1: hls.js (melhor para streams IPTV M3U8)
  tryPlayHls(video: HTMLVideoElement, url: string) {
    const HlsLib = (window as any).Hls;

    if (!HlsLib) {
      setTimeout(() => {
        (window as any).Hls ? this.tryPlayHls(video, url) : this.tryPlayNative(video, url);
      }, 1000);
      return;
    }

    if (!HlsLib.isSupported()) { this.tryPlayNative(video, url); return; }

    this.hls = new HlsLib(HLS_CONFIG);
    this.hls.loadSource(url);
    this.hls.attachMedia(video);

    this.hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
      video.play()
        .then(() => { this.isPlaying = true; this.isBuffering = false; this.retryCount = 0; this.cdr.detectChanges(); })
        .catch(() => {
          video.muted = true;
          video.play()
            .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
            .catch(() => this.showError('Reprodução bloqueada. Pressione Play.'));
        });
    });

    this.hls.on(HlsLib.Events.ERROR, (_: any, data: any) => {
      if (!data.fatal) return;
      if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) {
        if (this.retryCount < this.MAX_RETRIES) {
          this.retryCount++;
          this.retryTimeout = setTimeout(() => this.hls?.startLoad(), 2000 * this.retryCount);
        } else {
          this.hls?.destroy(); this.hls = null;
          this.tryPlayNative(video, url);
        }
      } else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
        this.hls?.recoverMediaError();
      } else {
        this.showError('Canal indisponível. Tente outro.');
      }
    });

    video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.detectChanges(); });
    video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.detectChanges(); });
  }

  tryPlayNative(video: HTMLVideoElement, url: string) {
    video.src = url;
    video.load();

    const onCanPlay = () => {
      cleanup();
      video.play()
        .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
        .catch(() => {
          video.muted = true;
          video.play()
            .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.detectChanges(); })
            .catch(() => this.showError('Não foi possível reproduzir este canal.'));
        });
    };

    const onError = () => {
      cleanup();
      const code = video.error?.code;
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) this.showError('Formato não suportado nesta TV.');
      else if (code === MediaError.MEDIA_ERR_NETWORK) this.showError('Erro de rede. Verifique sua conexão.');
      else this.showError('Canal indisponível.');
    };

    const cleanup = () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.detectChanges(); });
    video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.detectChanges(); });
  }

  showError(msg: string) {
    this.playerError = msg;
    this.isPlaying = false;
    this.isBuffering = false;
    this.cdr.detectChanges();
  }

  destroyPlayer() {
    if (this.retryTimeout) { clearTimeout(this.retryTimeout); this.retryTimeout = null; }
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    if (this.videoPlayerRef?.nativeElement) {
      const v = this.videoPlayerRef.nativeElement;
      v.pause(); v.removeAttribute('src'); v.load();
    }
    this.isPlaying = false;
    this.isBuffering = false;
  }

  // ─── CONTROLES ─────────────────────────────────────────
  togglePlay() {
    const v = this.videoPlayerRef?.nativeElement;
    if (!v) return;
    v.paused
      ? v.play().then(() => { this.isPlaying = true; this.cdr.detectChanges(); })
      : (v.pause(), this.isPlaying = false);
  }

  toggleMute() {
    const v = this.videoPlayerRef?.nativeElement;
    if (!v) return;
    this.isMuted = !this.isMuted;
    v.muted = this.isMuted;
  }

  setVolume(event: Event) {
    this.volume = +(event.target as HTMLInputElement).value;
    const v = this.videoPlayerRef?.nativeElement;
    if (v) { v.volume = this.volume / 100; this.isMuted = this.volume === 0; }
  }

  nextChannel() {
    const list = this.filteredChannels;
    const idx = list.findIndex(c => c.id === this.selectedChannel?.id);
    if (idx < list.length - 1) this.selectChannel(list[idx + 1]);
  }

  prevChannel() {
    const list = this.filteredChannels;
    const idx = list.findIndex(c => c.id === this.selectedChannel?.id);
    if (idx > 0) this.selectChannel(list[idx - 1]);
  }
}