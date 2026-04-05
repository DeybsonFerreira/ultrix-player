import { ContentType } from "./contentType";

export interface Channel {
    id: string;
    name: string;
    url: string;
    logo?: string;
    group: string;
    tvgId?: string;
    type: ContentType;
}