import { Entity } from "./entity/mod.ts";
import { ClientGame } from "./game.ts";
import { uiDestroy, uiInit } from "./internal.ts";
import { EntityReparented } from "./signals/mod.ts";

export class UIManager {
  #game: ClientGame;

  #container: HTMLDivElement | undefined;

  constructor(game: ClientGame) {
    this.#game = game;
  }

  [uiInit]() {
    if (this.#container) return;

    // Make sure parent div is relative
    this.#game.container.style.position = "relative";

    this.#container = document.createElement("div");
    this.#container.style.pointerEvents = "none";
    this.#container.style.position = "absolute";
    this.#container.style.inset = "0";
    this.#container.style.overflow = "hidden";

    this.#game.container.appendChild(this.#container);
  }

  [uiDestroy]() {
    this.#container?.remove();
    this.#container = undefined;
  }

  create(entity: Entity): readonly [container: HTMLDivElement, root: ShadowRoot] {
    if (!this.#container) {
      throw new Error("game not initialized");
    }

    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.inset = "0";

    const root = div.attachShadow({ mode: "open" });
    this.#container.appendChild(div);

    div.id = entity.id;
    entity.on(EntityReparented, () => (div.id = entity.id));

    return [div, root];
  }
}
