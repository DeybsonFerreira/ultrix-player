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


export interface ChannelGroup {
    name: string;      // ex: "AMAZON PRIME VIDEO"
    channels: Channel[]; // lista de canais/séries
    type: string;
}
