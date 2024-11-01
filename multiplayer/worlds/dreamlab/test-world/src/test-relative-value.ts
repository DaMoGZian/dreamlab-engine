import { Behavior, Entity, RelativeEntity } from "@dreamlab/engine";

export default class Test extends Behavior {
  e: Entity | undefined = undefined;

  override setup(): void {
    this.defineValue(Test, "e", { type: RelativeEntity });
  }
}
