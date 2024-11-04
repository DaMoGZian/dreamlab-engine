import RAPIER from "@dreamlab/vendor/rapier.ts";
import * as internal from "../../internal.ts";
import { IVector2, Vector2 } from "../../math/mod.ts";
import { EntityDestroyed, EntityEnableChanged } from "../../signals/mod.ts";
import { Entity, EntityContext } from "../entity.ts";
import { enumAdapter } from "@dreamlab/engine";

/**
 * @deprecated Use `Collider` with shape set to "Rectangle" instead.
 */
export class RectCollider extends Entity {
  static {
    Entity.registerType(this, "@core");
  }

  public static readonly icon = "🧱";
  get bounds(): Readonly<IVector2> | undefined {
    // controlled by globalTransform
    return { x: 1, y: 1 };
  }

  #internal: { collider: RAPIER.Collider; shape: RAPIER.Cuboid } | undefined;

  isSensor: boolean = false;

  get collider(): RAPIER.Collider {
    if (!this.#internal) throw new Error("attempted to access .collider on a prefab object");
    return this.#internal.collider;
  }

  constructor(ctx: EntityContext) {
    super(ctx);
    this.defineValue(RectCollider, "isSensor");
  }

  onInitialize(): void {
    this.#setupCollider();

    this.on(EntityDestroyed, () => {
      if (this.#internal) {
        this.game.physics.world.removeCollider(this.#internal.collider, false);
        this.#internal = undefined;
      }
    });

    this.on(EntityEnableChanged, ({ enabled }) => {
      this.#setupCollider();
      this.#internal?.collider.setEnabled(enabled);
    });
  }

  #setupCollider() {
    if (this.enabled && !this.#internal) {
      const desc = RAPIER.ColliderDesc.cuboid(
        this.globalTransform.scale.x / 2,
        this.globalTransform.scale.y / 2,
      )
        .setTranslation(this.globalTransform.position.x, this.globalTransform.position.y)
        .setRotation(this.globalTransform.rotation);

      const collider = this.game.physics.world.createCollider(desc);
      collider.setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.DEFAULT |
          RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED |
          RAPIER.ActiveCollisionTypes.FIXED_FIXED,
      );
      this.game.physics.registerCollider(this, collider);
      collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const shape = collider.shape as RAPIER.Cuboid;
      collider.setSensor(this.isSensor);

      this.#internal = { collider, shape };
    }
  }

  [internal.interpolationStartTick](): void {
    super[internal.interpolationStartTick]();
    this.#preparePhysicsUpdate();
  }

  onUpdate(): void {
    this.#applyPhysicsUpdate();
    super.onUpdate();
  }

  #preparePhysicsUpdate() {
    if (!this.game.physics.enabled) return;
    if (!this.#internal) return;

    this.#internal.collider.setTranslation({
      x: this.globalTransform.position.x,
      y: this.globalTransform.position.y,
    });
    this.#internal.collider.setRotation(this.globalTransform.rotation);
    this.#internal.shape.halfExtents = {
      x: this.globalTransform.scale.x / 2,
      y: this.globalTransform.scale.y / 2,
    };
  }

  #applyPhysicsUpdate() {
    if (!this.game.physics.enabled) return;
    if (!this.#internal) return;

    // FIXME: free-for-all entities should not have transform reported from the client for benign physics transform updates
    // for now, we just don't update the transform on the client.
    if (this.authority === undefined && this.game.isClient()) return;

    this.globalTransform.position = new Vector2(this.#internal.collider.translation());
    this.globalTransform.rotation = this.#internal.collider.rotation();
    this.globalTransform.scale = new Vector2(
      this.#internal.shape.halfExtents.x * 2,
      this.#internal.shape.halfExtents.y * 2,
    );
  }
}

// #region NEW COLLIDER
// TODO: implement capsule collider
//const ColliderShape = ["Rectangle", "Circle", "Capsule"] as const;
const ColliderShape = ["Rectangle", "Circle"] as const;
type ColliderShape = (typeof ColliderShape)[number];

export class Collider extends Entity {
  static {
    Entity.registerType(this, "@core");
  }

  public static readonly icon = "🧱";
  shape: ColliderShape = "Rectangle";
  isSensor: boolean = false;

  #internal:
    | { collider: RAPIER.Collider; shape: RAPIER.Cuboid | RAPIER.Ball | RAPIER.Capsule }
    | undefined;

  get bounds(): Readonly<IVector2> | undefined {
    return { x: 1, y: 1 };
  }

  get collider(): RAPIER.Collider {
    if (!this.#internal) throw new Error("attempted to access .collider on a prefab object");
    return this.#internal.collider;
  }

  constructor(ctx: EntityContext, shape: ColliderShape = "Rectangle") {
    super(ctx);
    this.shape = shape;
    this.defineValue(Collider, "isSensor");
    this.defineValue(Collider, "shape", { type: enumAdapter(ColliderShape) });
  }

  onInitialize(): void {
    this.#setupCollider();

    this.on(EntityDestroyed, () => {
      if (this.#internal) {
        this.game.physics.world.removeCollider(this.#internal.collider, false);
        this.#internal = undefined;
      }
    });

    this.on(EntityEnableChanged, ({ enabled }) => {
      this.#setupCollider();
      this.#internal?.collider.setEnabled(enabled);
    });
  }

  #setupCollider() {
    if (this.enabled && !this.#internal) {
      const desc =
        this.shape === "Rectangle"
          ? RAPIER.ColliderDesc.cuboid(
              this.globalTransform.scale.x / 2,
              this.globalTransform.scale.y / 2,
            )
          : this.shape === "Circle"
          ? RAPIER.ColliderDesc.ball(this.globalTransform.scale.x / 2)
          : RAPIER.ColliderDesc.capsule(
              this.globalTransform.scale.y / 2,
              this.globalTransform.scale.x / 2,
            );

      desc
        .setTranslation(this.globalTransform.position.x, this.globalTransform.position.y)
        .setRotation(this.globalTransform.rotation);

      const collider = this.game.physics.world.createCollider(desc);
      collider.setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.DEFAULT |
          RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED |
          RAPIER.ActiveCollisionTypes.FIXED_FIXED,
      );
      this.game.physics.registerCollider(this, collider);
      collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      collider.setSensor(this.isSensor);

      this.#internal = {
        collider,
        shape: desc.shape as RAPIER.Cuboid | RAPIER.Ball | RAPIER.Capsule,
      };
    }
  }

  [internal.interpolationStartTick](): void {
    super[internal.interpolationStartTick]();
    this.#preparePhysicsUpdate();
  }

  onUpdate(): void {
    this.#applyPhysicsUpdate();
    super.onUpdate();
  }

  #preparePhysicsUpdate() {
    if (!this.game.physics.enabled || !this.#internal) return;

    this.#internal.collider.setTranslation({
      x: this.globalTransform.position.x,
      y: this.globalTransform.position.y,
    });
    this.#internal.collider.setRotation(this.globalTransform.rotation);

    if (this.shape === "Rectangle" && this.#internal.shape instanceof RAPIER.Cuboid) {
      this.#internal.shape.halfExtents = {
        x: this.globalTransform.scale.x / 2,
        y: this.globalTransform.scale.y / 2,
      };
    } else if (this.shape === "Circle" && this.#internal.shape instanceof RAPIER.Ball) {
      this.#internal.shape.radius = this.globalTransform.scale.x / 2;
    }
    // else if (this.shape === "Capsule" && this.#internal.shape instanceof RAPIER.Capsule) {
    //   this.#internal.shape.radius = this.globalTransform.scale.x / 2;
    //   this.#internal.shape.halfHeight = this.globalTransform.scale.y / 2;
    // }
  }

  #applyPhysicsUpdate() {
    if (!this.game.physics.enabled || !this.#internal) return;

    if (this.authority === undefined && this.game.isClient()) return;

    this.globalTransform.position = new Vector2(this.#internal.collider.translation());
    this.globalTransform.rotation = this.#internal.collider.rotation();

    if (this.shape === "Rectangle" && this.#internal.shape instanceof RAPIER.Cuboid) {
      this.globalTransform.scale = new Vector2(
        this.#internal.shape.halfExtents.x * 2,
        this.#internal.shape.halfExtents.y * 2,
      );
    } else if (this.shape === "Circle" && this.#internal.shape instanceof RAPIER.Ball) {
      this.globalTransform.scale = new Vector2(
        this.#internal.shape.radius * 2,
        this.#internal.shape.radius * 2,
      );
    }
    // else if (this.shape === "Capsule" && this.#internal.shape instanceof RAPIER.Capsule) {
    //   this.globalTransform.scale = new Vector2(
    //     this.#internal.shape.radius * 2,
    //     this.#internal.shape.halfHeight * 2,
    //   );
    // }
  }
}
