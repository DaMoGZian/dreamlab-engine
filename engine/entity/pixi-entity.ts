import * as PIXI from "@dreamlab/vendor/pixi.ts";
import * as internal from "../internal.ts";
import { SignalSubscription } from "../signal.ts";
import {
  EntityDestroyed,
  EntityEnableChanged,
  EntityOwnEnableChanged,
  EntityReparented,
  GameRender,
} from "../signals/mod.ts";
import { Entity, EntityConstructor, EntityContext } from "./entity.ts";

export abstract class PixiEntity extends Entity {
  public container: PIXI.Container | undefined;

  static: boolean = false;
  hidden: boolean = false;

  #updateContainerPosition() {
    if (!this.container) return;

    const pos = this.interpolated.position;
    const rot = this.interpolated.rotation;
    this.container.position.set(pos.x, -pos.y);
    this.container.rotation = -rot;
    this.container.zIndex = this.z;
  }

  // NB(Charlotte):
  // the idea here is that we don't need to interpolate any pixi entity that's not going to move,
  // so we can save on a whole frame event listener when static is set to true.
  // with 10,000 static sprites on firefox 130b9 this takes me from 50fps to 140fps
  #gameRenderListener: SignalSubscription<GameRender> | undefined;
  #updateTransformListeners() {
    this.#gameRenderListener?.unsubscribe();
    this.#gameRenderListener = undefined;

    const shouldListen = !this.static && !this.hidden;
    if (shouldListen) {
      this.#gameRenderListener = this.game.on(GameRender, () => {
        this.#updateContainerPosition();
      });

      this.externalListeners.push(this.#gameRenderListener);
    }
  }

  #updateVisibility() {
    if (!this.container) return;

    const culled = !this.enabled;
    const visible = !(this.hidden || culled);
    this.container.visible = visible;
  }

  constructor(ctx: EntityContext, defineValues = true) {
    super(ctx);

    // this is a hack to stop editor facades getting tainted
    // FIXME: come up with a better way of doing this ^
    if (defineValues) {
      const staticValue = this.defineValue(
        this.constructor as EntityConstructor<PixiEntity>,
        "static",
      );

      const hiddenValue = this.defineValue(
        this.constructor as EntityConstructor<PixiEntity>,
        "hidden",
      );

      staticValue.onChanged(() => this.#updateTransformListeners());
      hiddenValue.onChanged(() => {
        this.#updateVisibility();
        this.#updateTransformListeners();
      });
    }

    // force add the render listener if not static
    this.#updateTransformListeners();

    this.on(EntityReparented, () => {
      this.#updateVisibility();
    });

    this.on(EntityEnableChanged, () => {
      this.#updateVisibility();
    });

    this.on(EntityDestroyed, () => {
      this.container?.destroy({ children: true });
    });

    this.on(EntityOwnEnableChanged, () => {
      this[internal.interpolationStartTick]();
      this[internal.interpolationStartFrame](0);
    });
  }

  onInitialize() {
    if (!this.game.isClient()) return;

    this.container = new PIXI.Container();
    this.game.renderer.scene.addChild(this.container);

    this.#updateContainerPosition();
    this.#updateVisibility();
  }
}
