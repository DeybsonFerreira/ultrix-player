import { Injectable } from '@angular/core';
import { Constants } from '../models/constants';
import { db } from '../models/db';
import { m3uListResult, m3uResult } from '../models/m3uListResult';

@Injectable({ providedIn: 'root' })
export class DexieService {

  async saveToDatabaseDexie(content: string) {
    try {


      await db.transaction('rw', db.playlists, async () => {
        const currentActive = await db.playlists.filter(playlist => playlist.active === true).first();
        //desativa o ativo
        if (currentActive?.id) {
          await db.playlists.update(currentActive.id, { active: false });
        }

        const lastItem = await db.playlists.orderBy('number').last();
        const lastNumber = lastItem?.number ?? 0;
        await db.playlists.add({ content, active: true, name: Constants.serverNameText, number: lastNumber + 1 });
      });

      return { ok: true };
    } catch (error) {
      console.error('Erro ao salvar no Dexie:', error);
      return { ok: false, error };
    }
  }

  async getPlaylistFromDexie(): Promise<m3uListResult> {
    try {
      const data = await db.playlists.toArray();

      if (!data) {
        let result: m3uListResult = { ok: false, data: [] };
        return result;
      }

      let result: m3uListResult = { ok: true, data: data };
      return result;
    } catch (error) {
      console.error('Erro ao buscar no Dexie:', error);
      let result: m3uListResult = { ok: false, data: [] };
      return result;
    }
  }

  async getPlaylistFromDexieActive(): Promise<m3uResult> {
    try {
      const data = await db.playlists.filter(x => x.active === true).first()

      if (!data) {
        let result: m3uResult = { ok: false, data: null };
        return result;
      }

      let result: m3uResult = { ok: true, data: data };
      return result;
    } catch (error) {
      console.error('Erro ao buscar no Dexie:', error);
      let result: m3uResult = { ok: false, data: null };
      return result;
    }
  }

  async removeById(id: number): Promise<boolean> {
    try {
      await db.playlists.delete(id);
      return true;
    } catch (error) {
      console.error('Erro ao remover do Dexie:', error);
      return false;
    }
  }


}
