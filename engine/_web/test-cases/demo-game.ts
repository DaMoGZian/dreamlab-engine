import { Behavior, Sprite2D, Vector2 } from "../../mod.ts";

class Movement extends Behavior {
  speed = 1.0;

  #up = this.inputs.create("@wasd/up", "Move Up", "KeyW");
  #down = this.inputs.create("@wasd/down", "Move Down", "KeyS");
  #left = this.inputs.create("@wasd/left", "Move Left", "KeyA");
  #right = this.inputs.create("@wasd/right", "Move Right", "KeyD");

  onInitialize(): void {
    this.value(Movement, "speed");
  }

  onTick(): void {
    const movement = new Vector2(0, 0);
    if (this.#up.pressed) movement.y += 1;
    if (this.#down.pressed) movement.y -= 1;
    if (this.#right.pressed) movement.x += 1;
    if (this.#left.pressed) movement.x -= 1;

    this.entity.transform.position = this.entity.transform.position.add(
      movement.normalize().mul((this.time.delta / 100) * this.speed),
    );
  }
}

class LookAtMouse extends Behavior {
  onTick(): void {
    const cursor = this.inputs.cursor;
    if (!cursor) return;

    const vec = cursor.world.sub(this.entity.globalTransform.position);
    this.entity.transform.rotation = -Math.atan2(vec.x, vec.y);
  }
}

class BulletBehaviour extends Behavior {
  onTick(): void {
    this.entity.transform.position.assign(this.entity.transform.position.add(Vector2.Y));
  }
}

class ClickFire extends Behavior {
  fire = this.inputs.create("fire", "Fire", "MouseLeft");

  onTick(): void {
    if (this.fire.pressed) {
      // TODO: Offset forward slightly
      const position = this.entity.globalTransform.position.bare();
      const rotation = this.entity.globalTransform.rotation;

      game.world.spawn({
        type: Sprite2D,
        name: "Bullet",
        transform: { position, rotation, scale: { x: 0.2, y: 0.2 } },
        behaviors: [{ type: BulletBehaviour }],
      });
    }
  }
}

export const player = game.world.spawn({
  type: Sprite2D,
  name: "Player",
  behaviors: [{ type: Movement }, { type: LookAtMouse }, { type: ClickFire }],
  transform: { position: { x: 1, y: 1 } },
});
