import Dexie, { Table } from 'dexie';
import { Constants } from './constants';

export interface PlaylistData {
    id?: number;
    content: string;
    active: boolean;
    name?: string;
    number?: number;
}

export class UltrixDatabase extends Dexie {
    playlists!: Table<PlaylistData>;

    constructor() {
        super(Constants.databaseName);

        this.version(1).stores({
            playlists: '++id, active, number', //melhor active , para filtrar
        });
    }
}

export const db = new UltrixDatabase();