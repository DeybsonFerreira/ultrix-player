import { Injectable } from '@angular/core';

/**
 * StorageService — persistência robusta para APK/TV
 *
 * Cascata de estratégias:
 *  1. Capacitor Filesystem (arquivo físico na pasta de dados do app)
 *     → persiste mesmo se o Android limpar o cache do WebView
 *  2. localStorage (fallback para browser / dev)
 *
 * Como usar:
 *   await this.storage.save('channels', JSON.stringify(data));
 *   const raw = await this.storage.load('channels');
 */

const FILE_PREFIX = 'ultrix_'; // prefixo dos arquivos salvos

@Injectable({ providedIn: 'root' })
export class StorageService {

  private useCapacitor: boolean = false;
  private Filesystem: any = null;
  private Directory: any = null;

  constructor() {
    this.detectCapacitor();
  }

  // ─── Detecta se está rodando dentro do Capacitor ──────────────────────
  private async detectCapacitor() {
    try {
      const cap = (window as any).Capacitor;
      if (!cap || !cap.isNativePlatform()) return;

      // Importação dinâmica — só existe dentro do APK
      const plugin = await import('@capacitor/filesystem');
      this.Filesystem = plugin.Filesystem;
      this.Directory = plugin.Directory;
      this.useCapacitor = true;

      console.log('[Storage] Modo: Capacitor Filesystem');
    } catch {
      console.log('[Storage] Modo: localStorage (fallback)');
    }
  }

  // ─── SALVAR ───────────────────────────────────────────────────────────
  async save(key: string, value: string): Promise<void> {
    if (this.useCapacitor && this.Filesystem) {
      try {
        await this.Filesystem.writeFile({
          path: `${FILE_PREFIX}${key}.json`,
          data: value,
          directory: this.Directory.Data,   // /data/data/com.seuapp/ → nunca limpo pelo sistema
          encoding: 'utf8',
          recursive: true,
        });
        console.log(`[Storage] Salvo no Filesystem: ${key}`);
        return;
      } catch (e) {
        console.warn('[Storage] Filesystem falhou, usando localStorage:', e);
      }
    }

    // Fallback: localStorage
    try {
      localStorage.setItem(`ultrix_${key}`, value);
      console.log(`[Storage] Salvo no localStorage: ${key}`);
    } catch (e) {
      console.error('[Storage] localStorage também falhou:', e);
    }
  }

  // ─── CARREGAR ─────────────────────────────────────────────────────────
  async load(key: string): Promise<string | null> {
    if (this.useCapacitor && this.Filesystem) {
      try {
        const result = await this.Filesystem.readFile({
          path: `${FILE_PREFIX}${key}.json`,
          directory: this.Directory.Data,
          encoding: 'utf8',
        });
        console.log(`[Storage] Carregado do Filesystem: ${key}`);
        return result.data as string;
      } catch {
        // Arquivo não existe ainda — tenta localStorage (migração de versões antigas)
        console.log(`[Storage] Arquivo não encontrado, tentando localStorage: ${key}`);
      }
    }

    // Fallback: localStorage
    const val = localStorage.getItem(`ultrix_${key}`);

    // Migração automática: se encontrou no localStorage e tem Filesystem, migra
    if (val && this.useCapacitor && this.Filesystem) {
      console.log(`[Storage] Migrando "${key}" do localStorage para Filesystem...`);
      await this.save(key, val);
      localStorage.removeItem(`ultrix_${key}`);
    }

    return val;
  }

  // ─── APAGAR ───────────────────────────────────────────────────────────
  async remove(key: string): Promise<void> {
    if (this.useCapacitor && this.Filesystem) {
      try {
        await this.Filesystem.deleteFile({
          path: `${FILE_PREFIX}${key}.json`,
          directory: this.Directory.Data,
        });
      } catch { /* arquivo pode não existir */ }
    }
    localStorage.removeItem(`ultrix_${key}`);
  }

  // ─── VERIFICAR EXISTÊNCIA ─────────────────────────────────────────────
  async exists(key: string): Promise<boolean> {
    const val = await this.load(key);
    return val !== null && val.length > 0;
  }
}