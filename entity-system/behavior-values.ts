import { Behavior } from "./behavior.ts";
import { Entity } from "./entity.ts";
import {
  Primitive,
  PrimitiveTypeTag,
  SyncedValue,
  SyncedValueRegistry,
} from "./synced-value.ts";

export class BehaviorValues<
  E extends Entity = Entity,
  B extends Behavior<E> = Behavior<E>
> {
  #behavior: B;
  #values: SyncedValue[];

  constructor(behavior: B) {
    this.#behavior = behavior;
    this.#values = [];
  }

  get all() {
    return this.#values;
  }

  value(
    typeTag: PrimitiveTypeTag,
    name: string,
    defaultValue: Primitive
  ): SyncedValue {
    const registry = this.#behavior.entity.game.syncedValues;
    const value = new SyncedValue(
      registry,
      `${this.#behavior.entity.uid}/${this.#behavior.uid}/${name}`,
      defaultValue,
      typeTag
    );
    this.#values.push(value);
    return value;
  }

  number(name: string, defaultValue: number): SyncedValue<number> {
    return this.value(Number, name, defaultValue) as SyncedValue<number>;
  }

  string(name: string, defaultValue: string): SyncedValue<string> {
    return this.value(String, name, defaultValue) as SyncedValue<string>;
  }

  boolean(name: string, defaultValue: boolean): SyncedValue<boolean> {
    return this.value(Boolean, name, defaultValue) as SyncedValue<boolean>;
  }

  destroy() {
    for (const value of this.#values) {
      value.destroy();
    }
  }
}
