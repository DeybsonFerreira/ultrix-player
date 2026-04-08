import { Injectable } from '@angular/core';
import { CacheKeys } from '../models/constants';
import { db } from '../models/db';
import { m3uListResult } from '../models/m3uListResult';

@Injectable({ providedIn: 'root' })
export class DexieService {

  async saveToDatabaseDexie(content: string) {
    try {

      await db.playlists.put({
        storageKey: CacheKeys.IPTV_LINK,
        content: content,
        updatedAt: Date.now()
      }, CacheKeys.IPTV_LINK);

      return { ok: true };
    } catch (error) {
      console.error('Erro ao salvar no Dexie:', error);
      return { ok: false, error };
    }
  }

  async getPlaylistFromDexie(): Promise<m3uListResult> {
    try {
      const data = await db.playlists
        .where('storageKey')
        .equals(CacheKeys.IPTV_LINK)
        .first();

      if (!data) {
        let result: m3uListResult = { ok: false, data: 'Playlist não encontrada.' };
        return result;
      }

      let result: m3uListResult = { ok: true, data: data.content };
      return result;
    } catch (error) {
      console.error('Erro ao buscar no Dexie:', error);
      let result: m3uListResult = { ok: false, data: 'Erro ao buscar playlist.' };
      return result;
    }
  }

}