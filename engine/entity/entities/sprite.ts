import * as PIXI from "@dreamlab/vendor/pixi.ts";
import { Entity, EntityContext } from "../entity.ts";
import { EntityPreUpdate, GameRender } from "../../signals/mod.ts";
import { IVector2, Vector2, lerp } from "../../math/mod.ts";

export class Sprite extends Entity {
  static readonly WHITE_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY/wPBAxAwAQiGBgYGAA9+AQAag6xEAAAAABJRU5ErkJggg==";

  width = this.values.number("width", 1);
  height = this.values.number("height", 1);
  texture = this.values.string("texture", Sprite.WHITE_PNG);

  #sprite: PIXI.Sprite | undefined;

  #currRenderPos: IVector2 | undefined;
  #currRenderRot: number | undefined;
  #lastRenderPos: IVector2 | undefined;
  #lastRenderRot: number | undefined;

  constructor(ctx: EntityContext) {
    super(ctx);

    PIXI.Assets.backgroundLoad(this.texture.value);

    this.on(EntityPreUpdate, () => {
      this.#lastRenderPos = this.#currRenderPos;
      this.#lastRenderRot = this.#currRenderRot;
      this.#currRenderPos = this.globalTransform.position.bare();
      this.#currRenderRot = this.globalTransform.rotation;
    });

    this.listen(this.game, GameRender, () => {
      if (!this.#sprite) return;

      this.#sprite.width = this.width.value * this.globalTransform.scale.x;
      this.#sprite.height = this.height.value * this.globalTransform.scale.y;

      const pos =
        this.#currRenderPos !== undefined && this.#lastRenderPos !== undefined
          ? Vector2.lerp(this.#lastRenderPos!, this.#currRenderPos, this.game.time.partial)
          : this.globalTransform.position;
      const rotation =
        this.#currRenderRot !== undefined && this.#lastRenderRot !== undefined
          ? lerp(this.#lastRenderRot!, this.#currRenderRot, this.game.time.partial)
          : this.globalTransform.rotation;

      this.#sprite.position = { x: pos.x, y: -pos.y };
      this.#sprite.rotation = rotation;
    });
  }

  async onInitialize() {
    if (!this.game.isClient()) return;

    const texture = await PIXI.Assets.load(this.texture.value);
    this.#sprite = new PIXI.Sprite({
      texture,
      width: this.width.value * this.globalTransform.scale.x,
      height: this.height.value * this.globalTransform.scale.y,
      position: {
        x: this.globalTransform.position.x,
        y: -this.globalTransform.position.y,
      },
      rotation: this.globalTransform.rotation,
      anchor: 0.5,
    });

    this.game.renderer.scene.addChild(this.#sprite);
  }

  destroy(): void {
    this.#sprite?.destroy();
  }
}
Entity.registerType(Sprite, "@core");
