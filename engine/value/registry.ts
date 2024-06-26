import * as internal from "../internal.ts";
import { Game } from "../game.ts";

import { BasicSignalHandler, exclusiveSignalType } from "../signal.ts";
import { SyncedValue } from "./value.ts";
import { ConnectionId } from "../network.ts";

export class SyncedValueChanged {
  constructor(
    public value: SyncedValue,
    public newValue: unknown,
    public generation: number,
    public originator: ConnectionId,
  ) {}

  [exclusiveSignalType] = SyncedValueRegistry;
}

export class SyncedValueRegistry extends BasicSignalHandler<SyncedValueRegistry> {
  #values = new Map<string, SyncedValue>();

  #originator: ConnectionId;
  get originator() {
    return this.#originator;
  }
  [internal.setSyncedValueRegistryOriginator](value: ConnectionId) {
    this.#originator = value;
  }

  readonly game: Game;

  constructor(game: Game) {
    super();
    this.game = game;
  }

  get values(): SyncedValue[] {
    return [...this.#values.values()];
  }

  lookup(identifier: string): SyncedValue | undefined {
    return this.#values.get(identifier);
  }

  register(value: SyncedValue) {
    if (this.#values.has(value.identifier))
      throw new Error(`SyncedValue with identifier '${value.identifier}' already exists!`);

    this.#values.set(value.identifier, value);
  }

  remove(value: SyncedValue) {
    this.#values.delete(value.identifier);
  }
}
