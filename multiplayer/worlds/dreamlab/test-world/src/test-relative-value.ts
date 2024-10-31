import { Behavior, Entity, EntityByRelativeSelector } from "@dreamlab/engine";

export default class Test extends Behavior {
  e: Entity | undefined = undefined;

  override setup(): void {
    this.defineValue(Test, "e", { type: EntityByRelativeSelector });
  }
}
