import { Vector2 } from "../../math/mod.ts";
import { JsonValue, ValueTypeAdapter } from "../data.ts";

/**
 * This supports a `Value<Vector2>`
 */
export class Vector2Adapter extends ValueTypeAdapter<Vector2> {
  isValue(value: unknown): value is Vector2 {
    return value instanceof Vector2;
  }
  convertToPrimitive(value: Vector2): JsonValue {
    return { x: value.x, y: value.y };
  }
  convertFromPrimitive(value: JsonValue): Vector2 {
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("A Vector2 value should be an object");
    }

    if (value === null) return Vector2.ZERO;

    if (
      !("x" in value && "y" in value) ||
      typeof value.x !== "number" ||
      typeof value.y !== "number"
    ) {
      throw new TypeError("Invalid Vector2 value");
    }

    return new Vector2({ x: value.x, y: value.y });
  }
}
