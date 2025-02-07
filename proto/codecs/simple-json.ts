import { PlayPacket } from "../play.ts";
import { PlayCodec } from "./mod.ts";

export const JSON_CODEC: PlayCodec = {
  encodePacket(packet: PlayPacket): string {
    return JSON.stringify(packet);
  },
  decodePacket(data: string | ArrayBufferLike | Blob | ArrayBufferView): PlayPacket {
    if (typeof data !== "string") throw new Error("SimpleJsonCodec expects string data!");
    const obj = JSON.parse(data);
    return obj as PlayPacket;
  },
};
