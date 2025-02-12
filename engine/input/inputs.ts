import { Camera } from "../entity/mod.ts";
import type { Game } from "../game.ts";
import { actionSetHeld, inputsRegisterHandlers } from "../internal.ts";
import { IVector2, Vector2 } from "../math/mod.ts";
import { BasicSignalHandler } from "../signal.ts";
import {
  ActionBound,
  ActionCreated,
  ActionDeleted,
  Click,
  MouseDown,
  MouseMove,
  MouseOut,
  MouseOver,
  MouseUp,
  Scroll,
} from "../signals/mod.ts";
import { Action } from "./action.ts";
import type { Input } from "./input.ts";
import { isInput } from "./input.ts";

// TODO: Scroll and cursor position support

export type Cursor = {
  // TODO: Readonly Vectors
  readonly world: Vector2 | undefined;
  readonly screen: Vector2 | undefined;
};

export class Inputs extends BasicSignalHandler<Inputs> {
  readonly #game: Game;
  constructor(game: Game) {
    super();
    this.#game = game;
  }

  // #region Keys
  #keys = new Set<Input>();
  getKey(key: Input): boolean {
    return this.#keys.has(key);
  }
  // #endregion

  // #region Actions
  #actions = new Map<string, Action>();

  public get actions(): readonly Action[] {
    return Object.freeze([...this.#actions.values()]);
  }

  public get bindings(): readonly (readonly [action: Action, input: Input | undefined])[] {
    return Object.freeze(
      this.#actions
        .values()
        // @ts-ignore This breaks in typedef-gen. something wrong with shim?
        .map(action => [action, action.binding] as const)
        .toArray(),
    );
  }

  public get(action: string): Action | undefined {
    return this.#actions.get(action);
  }

  public create(name: string, label: string, defaultBinding: Input): Action {
    const cached = this.#actions.get(name);
    if (cached) return cached;

    const action = new Action(name, label, defaultBinding, this.#game);
    action.on(ActionBound, this.#onBind);

    this.#actions.set(name, action);
    this.fire(ActionCreated, action);

    return action;
  }

  public remove(action: string | Action): void {
    const _action = typeof action === "string" ? this.#actions.get(action) : action;

    if (!_action) {
      throw new Error(`unknown action: ${action}`);
    }

    _action.unregister(ActionBound, this.#onBind);

    // TODO: Internal remove all listeners
    // _action.removeAllListeners();

    this.#actions.delete(_action.name);
    this.fire(ActionDeleted, _action);
  }

  #clearActions = () => {
    for (const action of this.actions.values()) {
      action[actionSetHeld](false, 0);
    }
  };
  // #endregion

  // #region Cursor
  #screenCursor: Vector2 | undefined = undefined;
  get cursor(): Cursor {
    const game = this.#game;

    return {
      screen: this.#screenCursor,
      get world() {
        if (!this.screen) {
          return undefined;
        }

        const camera = Camera.getActive(game);
        if (!camera) {
          return undefined;
        }
        return camera.screenToWorld(this.screen);
      },
    };
  }
  // #endregion

  // #region Event Handlers
  // #region Keyboard
  #onKeyDown = (ev: KeyboardEvent) => this.#onKey(ev, true);
  #onKeyUp = (ev: KeyboardEvent) => this.#onKey(ev, false);

  #onKey = (ev: KeyboardEvent, pressed: boolean) => {
    // Ignore repeat events
    if (ev.repeat) return;

    const input = ev.code;
    if (!isInput(input)) return;

    if (pressed) this.#keys.add(input);
    else this.#keys.delete(input);

    const tick = this.#game.time.ticks;
    for (const action of this.actions.values()) {
      if (action.binding !== input) continue;
      action[actionSetHeld](pressed, tick);
    }
  };
  // #endregion

  // #region Mouse
  #onMouseDown = (ev: MouseEvent) => this.#onMouse(ev, true);
  #onMouseUp = (ev: MouseEvent) => this.#onMouse(ev, false);

  #onMouse = (ev: MouseEvent, pressed: boolean) => {
    // @ts-expect-error: we know its a client game
    if (ev.target !== this.#game.renderer.app.canvas) {
      return;
    }

    ev.preventDefault();

    const input: Input | undefined =
      ev.button === 0
        ? "MouseLeft"
        : ev.button === 1
          ? "MouseMiddle"
          : ev.button === 2
            ? "MouseRight"
            : undefined;

    if (!input) return;
    const button =
      input === "MouseLeft" ? "left" : input === "MouseMiddle" ? "middle" : "right";

    const cursor = this.cursor;
    if (pressed) {
      if (cursor.screen && cursor.world) {
        this.fire(MouseDown, button, { screen: cursor.screen, world: cursor.world });
        if (button === "left") this.fire(Click, { screen: cursor.screen, world: cursor.world });
      }
    } else {
      this.fire(MouseUp, button, cursor);
    }

    const tick = this.#game.time.ticks;
    for (const action of this.actions.values()) {
      if (action.binding !== input) continue;
      action[actionSetHeld](pressed, tick);
    }
  };

  #onMouseOut = (ev: MouseEvent) => {
    this.#screenCursor = undefined;
    this.fire(MouseOut, { screen: undefined, world: undefined }, ev);
  };

  #onMouseMove = (ev: MouseEvent) => {
    const mouse = { x: ev.clientX, y: ev.clientY } satisfies IVector2;

    // @ts-expect-error: we know its a client game
    const canvas = this.#game.renderer.app.canvas as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const canvasCoords = {
      x: mouse.x - canvasRect.x,
      y: mouse.y - canvasRect.y,
    } satisfies IVector2;

    const over = this.#isOverCanvas(ev, canvas, canvasRect, canvasCoords);
    if (this.#screenCursor === undefined && over) {
      // mouse over
      this.#screenCursor = new Vector2(canvasCoords);

      const { world } = this.cursor;
      if (world) this.fire(MouseOver, { screen: this.#screenCursor, world }, ev);
    } else if (this.#screenCursor === undefined && !over) {
      // do nothing
    } else if (this.#screenCursor !== undefined && over) {
      // mouse move
      this.#screenCursor.assign(canvasCoords);

      const { world } = this.cursor;
      if (world) this.fire(MouseMove, { screen: this.#screenCursor, world }, ev);
    } else if (this.#screenCursor !== undefined && !over) {
      // mouse out
      this.#screenCursor = undefined;
      this.fire(MouseOut, { screen: undefined, world: undefined }, ev);
    }
  };

  #isOverCanvas(
    ev: MouseEvent,
    canvas: HTMLCanvasElement,
    canvasRect: DOMRect,
    canvasCoords: IVector2,
  ): boolean {
    const target = ev.target as HTMLElement | null;
    if (target === null) return false;
    if (target === canvas) return true;

    return (
      canvasCoords.x >= 0 &&
      canvasCoords.x <= canvasRect.width &&
      canvasCoords.y >= 0 &&
      canvasCoords.y <= canvasRect.height
    );
  }

  #onWheel = (ev: WheelEvent) => {
    const scale = Camera.METERS_TO_PIXELS;
    this.fire(Scroll, new Vector2({ x: ev.deltaX / scale, y: ev.deltaY / scale }), ev);
  };
  // #endregion

  #onBind = (ev: ActionBound) => {
    this.fire(ActionBound, ev.action, ev.input);
  };

  #onVisibilityChange = () => {
    if (document.visibilityState === "hidden") this.#clearActions();
  };

  #onContextMenu = (ev: MouseEvent) => {
    ev.preventDefault();
  };

  [inputsRegisterHandlers](): () => void {
    if (!this.#game.isClient()) {
      throw new Error("registerHandlers() can only be called on the client");
    }

    globalThis.addEventListener("keydown", this.#onKeyDown);
    globalThis.addEventListener("keyup", this.#onKeyUp);
    globalThis.addEventListener("mousedown", this.#onMouseDown);
    globalThis.addEventListener("mouseup", this.#onMouseUp);
    globalThis.addEventListener("wheel", this.#onWheel, { passive: false });
    globalThis.addEventListener("blur", this.#clearActions);
    globalThis.addEventListener("mousemove", this.#onMouseMove);
    globalThis.addEventListener("mouseout", this.#onMouseOut);
    document.addEventListener("visibilitychange", this.#onVisibilityChange);

    const canvas = this.#game.renderer.app.canvas;
    canvas.addEventListener("contextmenu", this.#onContextMenu);

    return () => {
      globalThis.removeEventListener("keydown", this.#onKeyDown);
      globalThis.removeEventListener("keyup", this.#onKeyUp);
      globalThis.removeEventListener("mousedown", this.#onMouseDown);
      globalThis.removeEventListener("mouseup", this.#onMouseUp);
      globalThis.removeEventListener("wheel", this.#onWheel);
      globalThis.removeEventListener("blur", this.#clearActions);
      globalThis.removeEventListener("mousemove", this.#onMouseMove);
      globalThis.removeEventListener("mouseout", this.#onMouseOut);
      document.removeEventListener("visibilitychange", this.#onVisibilityChange);

      canvas.removeEventListener("contextmenu", this.#onContextMenu);
    };
  }
  // #endregion
}
