import * as PIXI from "@dreamlab/vendor/pixi.ts";
import { IVector2, Vector2 } from "../../math/mod.ts";
import { EntityTransformUpdate } from "../../signals/mod.ts";
import { ColorAdapter } from "../../value/adapters/color-adapter.ts";
import { Entity, EntityContext } from "../entity.ts";
import { PixiEntity } from "../pixi-entity.ts";

export class SolidColor extends PixiEntity {
  static {
    Entity.registerType(this, "@core");
  }

  public static readonly icon = "🟪";
  sides: number = 4;
  width: number = 1;
  height: number = 1;
  color: string = "white";

  #gfx: PIXI.Graphics | undefined;

  get bounds(): Readonly<IVector2> | undefined {
    return new Vector2(this.width, this.height);
  }

  constructor(ctx: EntityContext) {
    super(ctx);

    this.defineValues(SolidColor, "width", "height", "sides");
    this.defineValue(SolidColor, "color", { type: ColorAdapter });

    const updateGfx = () => {
      this.#draw();
    };

    this.on(EntityTransformUpdate, updateGfx);

    const widthValue = this.values.get("width");
    const heightValue = this.values.get("height");
    const sidesValue = this.values.get("sides");

    widthValue?.onChanged(updateGfx);
    heightValue?.onChanged(updateGfx);
    sidesValue?.onChanged(updateGfx);

    const colorValue = this.values.get("color");
    colorValue?.onChanged(updateGfx);
  }

  #draw(): void {
    if (!this.#gfx) return;

    if (this.sides < 3) {
      console.warn("Invalid number of sides. Must be 3 or more.");
      return;
    }

    const width = this.width * this.globalTransform.scale.x;
    const height = this.height * this.globalTransform.scale.y;
    const color = new PIXI.Color(this.color);
    const radius = Math.min(width, height) / 2;

    this.#gfx.clear();

    const points = Array.from({ length: this.sides }, (_, i) => {
      const angle = (i / this.sides) * Math.PI * 2;
      return new PIXI.Point(radius * Math.cos(angle), radius * Math.sin(angle));
    });

    this.#gfx.clear().poly(points, true).fill({ color: color, alpha: color.alpha });

    this.#gfx.rotation = Math.PI / 4;
  }

  onInitialize() {
    super.onInitialize();
    if (!this.container) return;

    this.#gfx = new PIXI.Graphics();
    this.#draw();

    this.container.addChild(this.#gfx);
  }
}
