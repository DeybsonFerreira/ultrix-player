import { Injectable } from '@angular/core';
import { ContentType } from '../models/contentType';
import { Channel } from '../models/channel';
import { StorageService } from './storage-service';
import { ChannelGroup } from '../models/channelGroup';

// ─── Palavras-chave para classificação ────────────────────────────────────

const MOVIE_KEYWORDS = [
  'filme', 'filmes', 'movie', 'movies',
  'vod', 'cinema', 'lançamento', 'lancamento',
  '4k movie', 'hd movie',
];

const SERIES_KEYWORDS = [
  'serie', 'series', 'séries', 'sériado', 'seriado',
  'show', 'shows', 'episod', 'temporada', 'season',
  'netflix', 'amazon', 'hbo', 'disney', 'apple tv',
  'streaming',
];

function classifyGroup(groupName: string): ContentType {
  const lower = groupName.toLowerCase();
  if (SERIES_KEYWORDS.some(k => lower.includes(k))) return 'series';
  if (MOVIE_KEYWORDS.some(k => lower.includes(k))) return 'movie';
  return 'live';
}

// ─── Serviço ──────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class IptvService {

  private _allChannels: Channel[] = [];
  private _loaded = false;

  constructor(private storage: StorageService) { }

  // ── Acesso público ────────────────────────────────────

  get isLoaded(): boolean { return this._loaded; }
  get totalChannels(): number { return this._allChannels.length; }

  getByType(type: ContentType): Channel[] {
    return this._allChannels.filter(c => c.type === type);
  }

  getGroupsByType(type: ContentType): ChannelGroup[] {
    const channels = this.getByType(type);
    const map = new Map<string, Channel[]>();
    for (const ch of channels) {
      if (!map.has(ch.group)) map.set(ch.group, []);
      map.get(ch.group)!.push(ch);
    }
    return Array.from(map.entries()).map(([name, channels]) => ({ name, channels }));
  }

  getCount(type: ContentType): number {
    return this.getByType(type).length;
  }

  // ── Parse ─────────────────────────────────────────────

  parseM3U(content: string, storageKey: string, storageValue: string): { ok: boolean; error?: string; total?: number } {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    if (!lines[0]?.startsWith('#EXTM3U')) {
      return { ok: false, error: 'Arquivo inválido. Certifique-se que é uma playlist M3U.' };
    }

    const channels: Channel[] = [];
    let i = 1;

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('#EXTINF')) {
        const name = line.match(/,(.+)$/)?.[1]?.trim() || 'Sem nome';
        const group = line.match(/group-title="([^"]*)"/i)?.[1]?.trim() || 'Outros';
        const logo = line.match(/tvg-logo="([^"]*)"/i)?.[1]?.trim() || '';
        const tvgId = line.match(/tvg-id="([^"]*)"/i)?.[1]?.trim() || '';
        const type = classifyGroup(group);

        let j = i + 1;
        while (j < lines.length && lines[j].startsWith('#')) j++;

        const url = lines[j];
        i = j + 1;

        if (url && !url.startsWith('#')) {
          channels.push({ id: `ch_${channels.length}`, name, url, logo, group, tvgId, type });
        }
      } else {
        i++;
      }
    }

    if (channels.length === 0) {
      return { ok: false, error: 'Nenhum canal encontrado na playlist.' };
    }

    this._allChannels = channels;
    this._loaded = true;

    // Salva de forma assíncrona — não bloqueia a UI
    this.saveToStorage(storageKey, storageValue);

    return { ok: true, total: channels.length };
  }

  // ── Persistência ──────────────────────────────────────

  /** Salva os canais de forma persistente (Filesystem ou localStorage) */
  async saveToStorage(storageKey: string, storageValue: string): Promise<void> {
    try {
      const payload = JSON.stringify(this._allChannels);
      await this.storage.save(storageKey, storageValue);
      console.log(`[IptvService] ${this._allChannels.length} canais salvos`);
    } catch (e) {
      console.error('[IptvService] Erro ao salvar:', e);
    }
  }

  async loadStorage(storageKey: string) {
    const raw = await this.storage.load(storageKey);
    return raw;
  }

  /** Carrega os canais do storage. Retorna true se encontrou dados. */
  async loadFromStorage(storageKey: string): Promise<boolean> {
    try {
      const raw = await this.storage.load(storageKey);
      if (!raw) return false;

      const parsed: Channel[] = JSON.parse(raw);
      if (!parsed?.length) return false;

      // Migração: reclassifica canais antigos que não têm campo 'type'
      this._allChannels = parsed.map(ch => ({
        ...ch,
        type: ch.type ?? classifyGroup(ch.group),
      }));

      this._loaded = true;
      console.log(`[IptvService] ${this._allChannels.length} canais carregados do storage`);
      return true;
    } catch (e) {
      console.error('[IptvService] Erro ao carregar:', e);
      return false;
    }
  }

  /** Remove os canais do storage e da memória */
  async clearStorage(storageKey: string): Promise<void> {
    await this.storage.remove(storageKey);
    this._allChannels = [];
    this._loaded = false;
    console.log('[IptvService] Storage limpo');
  }
}