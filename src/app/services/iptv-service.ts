import { Injectable } from '@angular/core';
import { ContentType } from '../models/contentType';
import { Channel, Series } from '../models/channel';
import { ChannelGroup } from '../models/channelGroup';
import { DexieService } from './dexie-service';
import { m3uResult } from '../models/m3uListResult';

// ─── Palavras-chave para classificação ───────────────────────────────────
const SERIES_KEYWORDS = ['serie', 'série', 'temporada', 'season'];
const MOVIE_KEYWORDS = ['filme', 'movie', 'cinema'];
const LIVE_KEYWORDS = ['canal', 'canais', 'ao vivo', 'tv'];

function classifyContent(name: string, group: string, url: string): ContentType {
  const text = `${name} ${group}`.toLowerCase();
  const urlLower = url.toLowerCase();

  // 🥇 URL (mais confiável)
  if (urlLower.includes('/series/')) return 'series';
  if (urlLower.includes('/movie/') || urlLower.includes('/vod/')) return 'movie';
  if (urlLower.includes('/live/')) return 'live';

  // 🥇 Padrão episódio
  if (/s\d{1,2}e\d{1,2}/i.test(name)) return 'series';
  if (/\d{1,2}x\d{1,2}/.test(name)) return 'series';

  // 🥈 Keywords
  if (SERIES_KEYWORDS.some(k => text.includes(k))) return 'series';
  if (MOVIE_KEYWORDS.some(k => text.includes(k))) return 'movie';
  if (LIVE_KEYWORDS.some(k => text.includes(k))) return 'live';

  return 'live';
}

//Normalizar nome da série
function normalizeSeriesName(name: string): string {
  return name
    .replace(/s\d{1,2}e\d{1,2}/i, '')
    .replace(/\d{1,2}x\d{1,2}/i, '')
    .replace(/[\.\-_]/g, ' ')
    .trim();
}

//Extrair temporada/episódio
function extractSeasonEpisode(name: string) {
  const patterns = [
    /s(\d{1,2})e(\d{1,2})/i,
    /(\d{1,2})x(\d{1,2})/
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10)
      };
    }
  }

  return null;
}

// ─── Serviço ──────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class IptvService {


  constructor(
    private dexie: DexieService) {
  }

  private _allChannels: Channel[] = [];
  private _loaded = false;



  // ── Acesso público ────────────────────────────────────

  get isLoaded(): boolean { return this._loaded; }
  get totalChannels(): number { return this._allChannels.length; }

  async reloadm3u(type: ContentType): Promise<Channel[] | Series[] | string> {
    if (!this.isLoaded) {
      const result: m3uResult = await this.dexie.getPlaylistFromDexieActive();
      if (result.ok && result.data) {

        const parsed = this.parseM3U(result.data.content);

        if (type == 'live')
          return parsed.filter(x => x.type === 'live');

        if (type == 'movie')
          return parsed.filter(x => x.type === 'movie');

        if (type == 'series')
          return this.buildSeriesStructure(parsed);
      }
    }
    return '';
  }

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
    let result = Array.from(map.entries()).map(([name, channels]) => ({ name, channels }));
    return result;
  }

  getCount(type: ContentType): number {
    return this.getByType(type).length;
  }

  parseM3U(content: string): Channel[] {
    const lines = content.split('\n');

    const channels: Channel[] = [];

    const groupRegex = /group-title="([^"]*)"/i;
    const logoRegex = /tvg-logo="([^"]*)"/i;
    const tvgIdRegex = /tvg-id="([^"]*)"/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line.startsWith('#EXTINF:')) continue;

      const name = line.split(',').pop()?.trim() || 'Sem nome';

      const group = groupRegex.exec(line)?.[1] || 'Canais';
      const logo = logoRegex.exec(line)?.[1] || '';
      const tvgId = tvgIdRegex.exec(line)?.[1] || '';

      let url = '';

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();

        if (!nextLine || nextLine.startsWith('#')) continue;

        url = nextLine;
        i = j;
        break;
      }

      if (!url) continue;

      const type = classifyContent(name, group, url);

      channels.push({
        id: `ch_${channels.length}`,
        name,
        url,
        logo,
        group,
        tvgId,
        type
      });
    }

    return channels;
  }

  buildSeriesStructure(channels: Channel[]): Series[] {
    const map = new Map<string, Series>();

    for (const ch of channels) {
      if (ch.type !== 'series') continue;

      const info = extractSeasonEpisode(ch.name);
      if (!info) continue;

      const seriesName = normalizeSeriesName(ch.name);

      if (!map.has(seriesName)) {
        map.set(seriesName, {
          name: seriesName,
          seasons: []
        });
      }

      const series = map.get(seriesName)!;

      let season = series.seasons.find(s => s.season === info.season);

      if (!season) {
        season = { season: info.season, episodes: [] };
        series.seasons.push(season);
      }

      season.episodes.push({
        name: ch.name,
        url: ch.url,
        episode: info.episode
      });
    }

    // ordenar
    for (const s of map.values()) {
      s.seasons.sort((a, b) => a.season - b.season);
      for (const season of s.seasons) {
        season.episodes.sort((a, b) => a.episode - b.episode);
      }
    }

    return Array.from(map.values());
  }




  // ── Parse ─────────────────────────────────────────────
  // async parseM3U(content: string) {
  //   // Uso de Regex global para extração mais rápida em arquivos grandes
  //   const lines = content.split('\n');
  //   if (!lines[0]?.startsWith('#EXTM3U')) {
  //     return { ok: false, error: 'Arquivo inválido.' };
  //   }

  //   let allGroups = this.loadAllGroups(lines);
  //   let allNames = this.loadAllNames(lines);

  //   const channels: Channel[] = [];

  //   for (let i = 0; i < lines.length; i++) {
  //     const line = lines[i].trim();

  //     if (!line.startsWith('#EXTINF:')) continue;

  //     // 🔹 Extrai nome
  //     const name = line.split(',').pop()?.trim() || 'Sem nome';

  //     // 🔹 Regex única por linha (melhor performance)
  //     const groupMatch = line.match(/group-title="([^"]*)"/i);
  //     const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
  //     const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);

  //     const group = groupMatch?.[1] || 'Canais';
  //     const logo = logoMatch?.[1] || '';
  //     const tvgId = tvgIdMatch?.[1] || '';

  //     // 🔹 Buscar URL (próxima linha válida)
  //     let url = '';

  //     for (let j = i + 1; j < lines.length; j++) {
  //       const nextLine = lines[j].trim();

  //       if (!nextLine || nextLine.startsWith('#')) continue;

  //       url = nextLine;
  //       i = j; // avança o cursor
  //       break;
  //     }

  //     if (!url) continue;

  //     const type = classifyContent(name, group, url);
  //     channels.push({ id: `ch_${channels.length}`, name, url, logo, group, tvgId, type });
  //   }

  //   if (channels.length === 0)
  //     return { ok: false, error: 'Playlist vazia.' };

  //   this._allChannels = channels;
  //   this._loaded = true;
  //   return { ok: true, total: channels.length, data: channels };
  // }

  loadAllNames(lines: string[]): string[] {
    const allNames = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        const name = line.split(',').pop()?.trim() || 'Sem nome';

        allNames.add(name);
      }
    }
    return Array.from(allNames);
  }


  loadAllGroups(lines: string[]): string[] {
    const allGroups = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        const group = line.match(/group-title="([^"]*)"/i)?.[1] || '';

        allGroups.add(group);
      }
    }
    return Array.from(allGroups);
  }
}