import { Entity, EntityConstructor } from "./entity.ts";

export class EntityStore {
  #entitiesById = new Map<string, Entity>();
  #entitiesByRef = new Map<string, Entity>();

  lookupById(id: string): Entity | undefined {
    return this.#entitiesById.get(id);
  }

  lookupByRef(ref: string): Entity | undefined {
    return this.#entitiesByRef.get(ref);
  }

  lookupByType<T extends Entity>(type: EntityConstructor<T>): T[] {
    return [...this.#entitiesById.values()].filter(
      (entity): entity is T => entity instanceof type,
    );
  }

  /** for internal use */
  _register(entity: Entity, oldId?: string) {
    if (oldId && this.#entitiesById.get(oldId) === entity) this.#entitiesById.delete(oldId);

    const existingEntity = this.#entitiesByRef.get(entity.ref);
    if (existingEntity && existingEntity !== entity)
      throw new Error("tried to overwrite entity ref: " + entity.ref);

    this.#entitiesByRef.set(entity.ref, entity);
    this.#entitiesById.set(entity.id, entity);
  }
  /** for internal use */
  _unregister(entity: Entity) {
    this.#entitiesById.delete(entity.id);
    this.#entitiesByRef.delete(entity.ref);
  }
}
