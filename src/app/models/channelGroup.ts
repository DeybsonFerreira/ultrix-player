import { Channel } from "./channel";

export interface ChannelGroup {
    name: string;
    channels: Channel[];
    expanded?: boolean;
}