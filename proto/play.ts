import { z } from "@dreamlab/vendor/zod.ts";
import {
  EntityDefinitionSchema,
  EntityReferenceSchema,
  ConnectionIdSchema,
  Vector2Schema,
} from "./datamodel.ts";

export const PLAY_PROTO_VERSION = 1;

export const HandshakePacketSchema = z.object({
  t: z.literal("Handshake"),
  version: z.number(),
  instance_id: z.string(),
  world_id: z.string(),
});

export const ClientChatMessagePacketSchema = z.object({
  t: z.literal("ChatMessage"),
  message: z.string(),
});

export const ServerChatMessagePacketSchema = ClientChatMessagePacketSchema.extend({
  from_player_id: z.string(),
  from_connection_id: z.string(),
  from_nickname: z.string(),
});

export const ClientSetSyncedValuePacketSchema = z.object({
  t: z.literal("SetSyncedValue"),
  identifier: z.string(),
  value: z.any(),
  clock: z.number(),
});

export const ServerSetSyncedValuePacketSchema = ClientSetSyncedValuePacketSchema.extend({
  from: ConnectionIdSchema,
});

export const ClientSpawnEntityPacket = z.object({
  t: z.literal("SpawnEntity"),
  definition: EntityDefinitionSchema,
});

export const ServerSpawnEntityPacket = ClientSpawnEntityPacket.extend({
  from: ConnectionIdSchema,
});

export const ClientDeleteEntityPacket = z.object({
  t: z.literal("DeleteEntity"),
  entity: EntityReferenceSchema,
});

export const ServerDeleteEntityPacket = ClientDeleteEntityPacket.extend({
  from: ConnectionIdSchema,
});

const BaseRenameEntityPacket = z.object({
  t: z.literal("RenameEntity"),
  entity: EntityReferenceSchema,
  name: z.string(),
});
export const ClientRenameEntityPacket = BaseRenameEntityPacket.extend({
  // the server will drop your request if the current server-side name does not match old_name
  old_name: z.string(),
});
export const ServerRenameEntityPacket = BaseRenameEntityPacket.extend({
  from: ConnectionIdSchema,
});

const BaseReparentEntityPacket = z.object({
  t: z.literal("ReparentEntity"),
  entity: EntityReferenceSchema,
  parent: EntityReferenceSchema,
});
export const ClientReparentEntityPacket = BaseReparentEntityPacket.extend({
  old_parent: EntityReferenceSchema.optional(),
});
export const ServerReparentEntityPacket = BaseReparentEntityPacket.extend({
  from: ConnectionIdSchema,
});

export const ClientRequestExclusiveAuthorityPacket = z.object({
  t: z.literal("RequestExclusiveAuthority"),
  entity: EntityReferenceSchema,
  clock: z.number(),
});

export const ClientRelinquishExclusiveAuthorityPacket = z.object({
  t: z.literal("RelinquishExclusiveAuthority"),
  entity: EntityReferenceSchema,
});

export const ServerAnnounceExclusiveAuthorityPacket = z.object({
  t: z.literal("AnnounceExclusiveAuthority"),
  entity: EntityReferenceSchema,
  to: ConnectionIdSchema,
  clock: z.number(),
});

// sent to the requester to let them know the correct clock value
export const ServerDenyExclusiveAuthorityPacket = z.object({
  t: z.literal("DenyExclusiveAuthority"),
  entity: EntityReferenceSchema,
  clock: z.number(),
});

// clients can only report transform for entities over which they have exclusive authority
export const ClientReportEntityTransformPacket = z.object({
  t: z.literal("ReportEntityTransform"),
  entity: EntityReferenceSchema,
  position: Vector2Schema,
  rotation: z.number(),
  scale: Vector2Schema,
});

export const ServerReportEntityTransformPacket = ClientReportEntityTransformPacket.extend({
  from: ConnectionIdSchema,
});

const BaseCustomMessagePacket = z.object({
  t: z.literal("CustomMessage"),
  channel: z.string(),
  data: z.any(),
});
export const ClientCustomMessagePacket = BaseCustomMessagePacket.extend({
  to: ConnectionIdSchema.or(z.literal("*")).optional(),
});
export const ServerCustomMessagePacket = BaseCustomMessagePacket.extend({
  from: ConnectionIdSchema,
});

export const ClientPacketSchema = z.discriminatedUnion("t", [
  ClientChatMessagePacketSchema,
  ClientSetSyncedValuePacketSchema,
  ClientSpawnEntityPacket,
  ClientDeleteEntityPacket,
  ClientRenameEntityPacket,
  ClientReparentEntityPacket,
  ClientCustomMessagePacket,
  ClientRequestExclusiveAuthorityPacket,
  ClientRelinquishExclusiveAuthorityPacket,
  ClientReportEntityTransformPacket,
]);
export type ClientPacket = z.infer<typeof ClientPacketSchema>;

export const ServerPacketSchema = z.discriminatedUnion("t", [
  HandshakePacketSchema,
  ServerChatMessagePacketSchema,
  ServerSetSyncedValuePacketSchema,
  ServerSpawnEntityPacket,
  ServerDeleteEntityPacket,
  ServerRenameEntityPacket,
  ServerReparentEntityPacket,
  ServerCustomMessagePacket,
  ServerAnnounceExclusiveAuthorityPacket,
  ServerDenyExclusiveAuthorityPacket,
  ServerReportEntityTransformPacket,
]);
export type ServerPacket = z.infer<typeof ServerPacketSchema>;

export type PlayPacket<
  T extends (ClientPacket | ServerPacket)["t"] | undefined = undefined,
  Side extends "server" | "client" | "any" = "any",
> = (Side extends "any"
  ? ClientPacket | ServerPacket
  : Side extends "client"
    ? ClientPacket
    : ServerPacket) &
  (T extends string ? { t: T } : object);
