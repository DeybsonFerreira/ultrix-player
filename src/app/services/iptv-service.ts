import { Injectable } from '@angular/core';
import { ContentType } from '../models/contentType';
import { Channel } from '../models/channel';
import { StorageService } from './storage-service';
import { ChannelGroup } from '../models/channelGroup';
import Dexie from 'dexie';

// ─── Palavras-chave para classificação ────────────────────────────────────

const SERIES_KEYWORDS = ['serie', 'séries', 'episod', 'temporada', 'season', 'netflix', 'disney+', 'hbo', 'apple tv', 'prime video'];
const MOVIE_KEYWORDS = ['filme', 'movies', 'vod', 'cinema', 'lançamento', '4k', 'hd', '1080p', '720p'];
const LIVE_KEYWORDS = ['canais', 'ao vivo', 'tv'];

function classifyContent(name: string, group: string): ContentType {
  // 1. Transformamos tudo para minúsculas logo no início
  const nameLower = name.toLowerCase();
  const groupLower = group.toLowerCase();

  // Combinamos ambos para uma busca única e eficiente
  const fullText = `${nameLower} ${groupLower}`;

  if (LIVE_KEYWORDS.some(k => fullText.includes(k.toLowerCase()))) {
    return 'live';
  }
  // 2. Verificamos as Keywords (que já devem estar em minúsculas na sua constante)
  if (SERIES_KEYWORDS.some(k => fullText.includes(k.toLowerCase()))) {
    return 'series';
  }

  if (MOVIE_KEYWORDS.some(k => fullText.includes(k.toLowerCase()))) {
    return 'movie';
  }

  return 'live';
}

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
  parseM3U(content: string, storageKey: string, storageValue: string) {
    // Uso de Regex global para extração mais rápida em arquivos grandes
    const lines = content.split('\n');
    if (!lines[0]?.startsWith('#EXTM3U')) {
      return { ok: false, error: 'Arquivo inválido.' };
    }

    const channels: Channel[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        // Extração via Regex para evitar múltiplos .match lentos
        const name = line.split(',').pop()?.trim() || 'Sem nome';
        const group = line.match(/group-title="([^"]*)"/i)?.[1] || 'Canais';
        const logo = line.match(/tvg-logo="([^"]*)"/i)?.[1] || '';
        const tvgId = line.match(/tvg-id="([^"]*)"/i)?.[1] || '';
        const type = classifyContent(name, group);

        // A URL costuma ser a próxima linha que não começa com #
        let url = '';
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.startsWith('#')) {
            url = nextLine;
            i = j; // Pula o cursor para a linha da URL
            break;
          }
        }

        if (url) {
          channels.push({ id: `ch_${channels.length}`, name, url, logo, group, tvgId, type });
        }
      }
    }

    if (channels.length === 0)
      return { ok: false, error: 'Playlist vazia.' };

    this._allChannels = channels;
    this._loaded = true;

    return { ok: true, total: channels.length, data: channels };
  }

  // ── Persistência ──────────────────────────────────────

  saveIPTVDatabaseContent(storageValue: string) {
    const db = new Dexie('IPTVDatabase');
    db.version(1).stores({ channels: '++id, name, url, logo, group, tvgId, type' });

  }

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