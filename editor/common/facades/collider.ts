import {
  Entity,
  EntityContext,
  IVector2,
  PixiEntity,
  Collider,
  enumAdapter,
} from "@dreamlab/engine";
import { EnsureCompatible, EntityValueProps } from "./_compatibility.ts";
import { DebugSquare, DebugCircle, DebugCapsule } from "./_debug.ts";
import { Facades } from "./manager.ts";

// const ColliderShape = ["Rectangle", "Circle", "Capsule"] as const;
const ColliderShape = ["Rectangle", "Circle"] as const;
type ColliderShape = (typeof ColliderShape)[number];

export class EditorFacadeCollider extends PixiEntity {
  static {
    Entity.registerType(this, "@editor");
    Facades.register(Collider, this);
  }

  isSensor: boolean = false;
  shape: ColliderShape = "Rectangle";

  static readonly icon = Collider.icon;
  get bounds(): Readonly<IVector2> | undefined {
    return { x: 1, y: 1 };
  }

  constructor(ctx: EntityContext) {
    super(ctx, false);
    this.defineValue(EditorFacadeCollider, "isSensor");
    this.defineValue(EditorFacadeCollider, "shape", { type: enumAdapter(ColliderShape) });
  }

  #debug: DebugSquare | DebugCircle | DebugCapsule | undefined;

  onInitialize(): void {
    super.onInitialize();
    if (!this.container) return;

    this.#debug = this.createDebugShape();
    this.container.addChild(this.#debug.gfx);

    const shapeValue = this.values.get("shape");
    shapeValue?.onChanged(() => this.onShapeChanged());
  }

  onShapeChanged(): void {
    if (!this.container) return;

    if (this.#debug) {
      this.container.removeChild(this.#debug.gfx);
    }
    this.#debug = this.createDebugShape();
    this.container.addChild(this.#debug.gfx);
  }

  private createDebugShape(): DebugSquare | DebugCircle | DebugCapsule {
    return this.shape === "Rectangle"
      ? new DebugSquare({ entity: this })
      : this.shape === "Circle"
      ? new DebugCircle({ entity: this })
      : new DebugCapsule({ entity: this });
  }
}

type _HasAllValues = EnsureCompatible<
  Omit<EntityValueProps<Collider>, "collider">,
  EntityValueProps<EditorFacadeCollider>
>;
