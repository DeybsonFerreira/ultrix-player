import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { HLS_CONFIG } from '../models/hls.config';


/**
 * Classe base compartilhada entre LiveTvComponent, MoviesComponent e SeriesComponent.
 *
 * Centraliza toda a lógica do player de vídeo:
 *  - Carregamento e pré-carregamento da lib HLS (antes era responsabilidade do PlayerService)
 *  - Reprodução HLS e nativa (com fallback automático)
 *  - Retry automático em erros de rede
 *  - Controles: play/pause, mute, volume, seek, progresso
 *  - Relógio em tempo real
 *  - Destruição segura do player
 *
 * Os componentes filhos devem:
 *  1. Estender esta classe
 *  2. Injetar `ChangeDetectorRef` e passá-lo ao `super()`
 *     (PlayerService foi removido — não é mais necessário)
 *  3. Garantir que `@ViewChild('videoPlayer')` está no template com #videoPlayer
 *  4. Chamar `this.preloadHls()` no ngOnInit (ou deixar startPlayback() lidar automaticamente)
 *  5. Sobrescrever `onEnded()` se precisar de comportamento pós-fim (ex.: próximo episódio)
 *
 * Migração dos filhos existentes:
 *  - Remova a injeção de `PlayerService` do construtor
 *  - Remova `playerService` do `super(cdr, playerService)` → `super(cdr)`
 *  - Substitua `this.playerService.preloadHls()` por `this.preloadHls()`
 *  - Remova o import de PlayerService
 */
@Directive()
export abstract class PlayerService implements OnDestroy {

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  // ── Estado do player ──────────────────────────────────
  isPlaying = false;
  isBuffering = false;
  playerError = '';
  volume = 80;
  isMuted = false;

  /** Tempo atual formatado (usado como relógio ou como posição do vídeo, conforme o filho) */
  currentTime = '00:00';
  duration = '00:00';

  // ── Internos ──────────────────────────────────────────
  protected hls: any = null;
  protected retryTimeout: any;
  protected retryCount = 0;
  protected readonly MAX_RETRIES = 3;
  protected clockInterval: any;

  constructor(protected cdr: ChangeDetectorRef) { }

  // ── Lifecycle ─────────────────────────────────────────

  ngOnDestroy(): void {
    this.destroyPlayer();
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
  }

  // ── Pré-carregamento HLS (antes em PlayerService) ─────

  /**
   * Carrega a lib HLS.js de forma assíncrona.
   * Tenta primeiro o bundle local (js/hls.min.js) e cai no CDN em caso de falha.
   * Seguro chamar múltiplas vezes — ignora se a lib já estiver carregada.
   */
  preloadHls(): void {
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

  // ── Relógio ───────────────────────────────────────────

  protected startClock(): void {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  protected updateClock(): void {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.cdr.markForCheck();
  }

  // ── Reprodução principal ──────────────────────────────

  /**
   * Inicia a reprodução de uma URL.
   * Detecta automaticamente HLS (.m3u8 / /hls/ / type=m3u_plus) ou nativo.
   */
  protected async startPlayback(url: string): Promise<void> {
    this.destroyPlayer();
    const video = this.videoPlayerRef?.nativeElement;
    if (!video) return;

    this.isPlaying = false;
    this.isBuffering = true;
    this.playerError = '';
    this.cdr.markForCheck();

    const clean = url.trim();
    const isHls = clean.includes('.m3u8')
      || clean.includes('.m3u')
      || clean.includes('/hls/')
      || clean.includes('type=m3u_plus');

    isHls ? this.tryPlayHls(video, clean) : this.tryPlayNative(video, clean);
  }

  // ── HLS ───────────────────────────────────────────────

  protected tryPlayHls(video: HTMLVideoElement, url: string): void {
    const HlsLib = (window as any).Hls;

    if (!HlsLib) {
      // Lib ainda carregando — aguarda 1 s e tenta novamente
      setTimeout(() =>
        (window as any).Hls
          ? this.tryPlayHls(video, url)
          : this.tryPlayNative(video, url),
        1000
      );
      return;
    }

    if (!HlsLib.isSupported()) { this.tryPlayNative(video, url); return; }

    this.hls = new HlsLib(HLS_CONFIG);
    this.hls.loadSource(url);
    this.hls.attachMedia(video);

    this.hls.on(HlsLib.Events.MANIFEST_PARSED, () => this.doPlay(video));

    this.hls.on(HlsLib.Events.ERROR, (_: any, data: any) => {
      if (!data.fatal) return;

      if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.showRetrying();
        this.retryTimeout = setTimeout(() => this.hls?.startLoad(), 2000 * this.retryCount);
      } else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
        this.hls?.recoverMediaError();
      } else {
        this.hls?.destroy(); this.hls = null;
        this.tryPlayNative(video, url);
      }
    });

    this.attachVideoEvents(video);
  }

  // ── Nativo ────────────────────────────────────────────

  protected tryPlayNative(video: HTMLVideoElement, url: string): void {
    video.src = url;
    video.load();

    const onCanPlay = () => { cleanup(); this.doPlay(video); };

    const onError = () => {
      cleanup();
      const code = video.error?.code ?? -1;

      if (code === MediaError.MEDIA_ERR_NETWORK && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.showRetrying();
        this.retryTimeout = setTimeout(() => video.load(), 2000 * this.retryCount);
        return;
      }

      switch (code) {
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          this.showError('Formato não suportado neste dispositivo.\nTente novamente ou escolha outro conteúdo.');
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          this.showError('Erro de rede — servidor indisponível.\nTente novamente.');
          break;
        case MediaError.MEDIA_ERR_DECODE:
          this.showError('Erro ao decodificar o vídeo.\nTente novamente.');
          break;
        default:
          this.showError('Não foi possível reproduzir este conteúdo.\nTente novamente.');
      }
    };

    const cleanup = () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    this.attachVideoEvents(video);
  }

  // ── Helpers internos ──────────────────────────────────

  private doPlay(video: HTMLVideoElement): void {
    video.play()
      .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.markForCheck(); })
      .catch(() => {
        // TVs costumam bloquear autoplay sem mute — tenta silenciado
        video.muted = true;
        video.play()
          .then(() => { this.isPlaying = true; this.isBuffering = false; this.cdr.markForCheck(); })
          .catch(() => this.showError('Não foi possível iniciar a reprodução.'));
      });
  }

  private attachVideoEvents(video: HTMLVideoElement): void {
    video.addEventListener('waiting', () => { this.isBuffering = true; this.cdr.markForCheck(); });
    video.addEventListener('playing', () => { this.isBuffering = false; this.cdr.markForCheck(); });
    video.addEventListener('timeupdate', () => this.updateProgress(video));
    video.addEventListener('ended', () => this.onEnded());
  }

  // ── Hook para os filhos ───────────────────────────────

  /** Sobrescreva nos filhos para reagir ao fim do vídeo (ex.: próximo episódio). */
  protected onEnded(): void { }

  // ── Progresso ─────────────────────────────────────────

  protected updateProgress(video: HTMLVideoElement): void {
    this.duration = isFinite(video.duration) ? this.fmtTime(video.duration) : '--:--';
    this.cdr.markForCheck();
  }

  protected fmtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const sec = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // ── Estado de erro / retry ────────────────────────────

  protected showRetrying(): void {
    this.playerError = `Reconectando... (${this.retryCount}/${this.MAX_RETRIES})`;
    this.isBuffering = true;
    this.cdr.markForCheck();
  }

  showError(msg: string): void {
    this.playerError = msg;
    this.isPlaying = false;
    this.isBuffering = false;
    this.cdr.markForCheck();
  }

  // ── Destroy ───────────────────────────────────────────

  destroyPlayer(): void {
    if (this.retryTimeout) { clearTimeout(this.retryTimeout); this.retryTimeout = null; }
    if (this.hls) { this.hls.destroy(); this.hls = null; }

    const v = this.videoPlayerRef?.nativeElement;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }

    this.isPlaying = false;
    this.isBuffering = false;
  }

  // ── Controles públicos ────────────────────────────────

  togglePlay(): void {
    const v = this.videoPlayerRef?.nativeElement;
    if (!v) return;
    v.paused
      ? v.play().then(() => { this.isPlaying = true; this.cdr.markForCheck(); })
      : (v.pause(), this.isPlaying = false, this.cdr.markForCheck());
  }

  toggleMute(): void {
    const v = this.videoPlayerRef?.nativeElement;
    if (!v) return;
    this.isMuted = !this.isMuted;
    v.muted = this.isMuted;
    this.cdr.markForCheck();
  }

  setVolume(event: Event): void {
    this.volume = +(event.target as HTMLInputElement).value;
    const v = this.videoPlayerRef?.nativeElement;
    if (v) { v.volume = this.volume / 100; this.isMuted = this.volume === 0; }
    this.cdr.markForCheck();
  }

  seek(event: Event): void {
    const v = this.videoPlayerRef?.nativeElement;
    const val = +(event.target as HTMLInputElement).value;
    if (v && isFinite(v.duration)) v.currentTime = (val / 100) * v.duration;
  }

  get progressPercent(): number {
    const v = this.videoPlayerRef?.nativeElement;
    if (!v || !isFinite(v.duration) || v.duration === 0) return 0;
    return (v.currentTime / v.duration) * 100;
  }

  retryPlayback(url: string): void {
    this.retryCount = 0;
    this.startPlayback(url);
  }
}