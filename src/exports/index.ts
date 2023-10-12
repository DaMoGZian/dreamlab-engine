export { createGame, type Game } from '~/game.js'
export {
  createEntity,
  dataManager,
  isEntity,
  type Entity,
  type InitContext,
  type Partialize,
  type RenderContext,
} from '~/entity.js'
export type { Event, EventArgs, EventHandler } from '~/events.js'
export {
  SpawnableDefinitionSchema,
  type SpawnableDefinition,
  type LooseSpawnableDefinition,
} from '~/spawnable/definition.js'
export {
  createSpawnableEntity,
  isSpawnableEntity,
  type PartializeSpawnable,
  type SpawnableEntity,
  type UID,
} from '~/spawnable/spawnableEntity.js'
export type { Physics } from '~/physics.js'
