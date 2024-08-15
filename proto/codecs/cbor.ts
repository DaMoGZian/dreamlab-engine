import * as CBOR from "https://deno.land/x/cbor@v1.6.0/index.js";

import { PlayPacket } from "../play.ts";
import { PlayCodec } from "./mod.ts";

export const CBOR_CODEC: PlayCodec = {
  encodePacket(packet: PlayPacket): string {
    return CBOR.encode(packet);
  },
  decodePacket(data: string | ArrayBufferLike | Blob | ArrayBufferView): PlayPacket {
    if (typeof data === "string") throw new TypeError("CBOR decoder expects binary data");

    if (data instanceof Blob) {
      throw new TypeError(`socket binaryType must be set to "arrayBuffer"`);
    }

    const buffer = "buffer" in data ? data.buffer : data;
    const obj = CBOR.decode(new Uint8Array(buffer));
    return obj as PlayPacket;
  },
};
