import { EntityTransformUpdate } from "@dreamlab/engine";
import * as PIXI from "@dreamlab/vendor/pixi.ts";
import { ClientGame, Game } from "../../game.ts";
import { IVector2, Vector2, smoothLerp } from "../../math/mod.ts";
import { ActiveCameraChanged, EntityDestroyed, GameRender } from "../../signals/mod.ts";
import { Entity, EntityContext } from "../entity.ts";

export class Camera extends Entity {
  static {
    Entity.registerType(this, "@core");
  }

  public static readonly icon = "🎥";
  public static readonly METERS_TO_PIXELS = 100;
  public static readonly TARGET_VIEWPORT_SIZE = 10;
  public readonly bounds: undefined;

  public readonly container: PIXI.Container;
  public unlocked: boolean = false;

  #smooth: number = 0.1;
  #lnsmooth: number = Math.log(2) / (this.#smooth * 1000);
  public get smooth(): number {
    return this.#smooth;
  }
  public set smooth(value: number) {
    this.#smooth = Math.max(value, 0);
    this.#lnsmooth = value === 0 ? 0 : Math.log(2) / (this.#smooth * 1000);
  }

  #position: Vector2 = new Vector2(this.interpolated.position);
  #rotation: number = this.interpolated.rotation;
  #scale: Vector2 = new Vector2(this.interpolated.scale);

  #matrix() {
    const game = this.game as ClientGame;

    let scale = 1;
    if (!this.unlocked) {
      const canvas = game.renderer.app.canvas;
      const w = canvas.width / Camera.METERS_TO_PIXELS;
      const h = canvas.height / Camera.METERS_TO_PIXELS;
      const axis = Math.min(w, h);
      scale = axis / Camera.TARGET_VIEWPORT_SIZE;
    }

    return PIXI.Matrix.shared
      .translate(-this.#position.x, this.#position.y)
      .rotate(this.#rotation)
      .scale(Camera.METERS_TO_PIXELS, Camera.METERS_TO_PIXELS)
      .scale(1 / (this.#scale.x / scale), 1 / (this.#scale.y / scale))
      .translate(game.renderer.app.canvas.width / 2, game.renderer.app.canvas.height / 2);
  }

  get smoothed(): {
    readonly position: IVector2;
    readonly rotation: number;
    readonly scale: IVector2;
  } {
    return {
      position: this.#position.bare(),
      rotation: this.#rotation,
      scale: this.#scale.bare(),
    };
  }

  #active = false;
  get active(): boolean {
    return this.#active && this.enabled;
  }
  set active(value: boolean) {
    // Early return if we are already active
    if (value && this.#active) return;

    const previous = Camera.getActive(this.game);
    if (!value) {
      if (this.#active === true) {
        this.game.fire(ActiveCameraChanged, undefined, this);
      }

      this.#active = false;
      return;
    }

    const cameras = this.game.entities.lookupByType(Camera);
    for (const camera of cameras) camera.active = false;
    this.#active = true;

    // Instantly set smoothed values
    this.#position = new Vector2(this.interpolated.position);
    this.#rotation = this.interpolated.rotation;
    this.#scale = new Vector2(this.interpolated.scale);

    // Reparent scene container
    const game = this.game as ClientGame;
    this.container.addChild(game.renderer.scene);

    // Emit event
    this.game.fire(ActiveCameraChanged, this, previous);
  }

  // TODO: Look into improving this API maybe?
  public static getActive(game: Game): Camera | undefined {
    return game.entities.lookupByType(Camera).find(camera => camera.active);
  }

  public zoom: number;

  constructor(ctx: EntityContext) {
    super(ctx);

    // Must be a local entity
    if (ctx.parent !== this.game.local || !this.game.isClient()) {
      throw new Error(`${this.constructor.name} must be spawned as a local client entity`);
    }

    this.container = new PIXI.Container();
    this.game.renderer.app.stage.addChild(this.container);

    this.defineValue(Camera, "active", { replicated: false });
    this.defineValue(Camera, "smooth", { replicated: false });
    this.defineValue(Camera, "unlocked", { replicated: false });

    this.listen(this.game, GameRender, () => {
      if (!this.#active) return;
      const delta = this.game.time.delta;

      // No smoothing
      if (this.#lnsmooth === 0) {
        this.#position.x = this.interpolated.position.x;
        this.#position.y = this.interpolated.position.y;
        this.#rotation = this.interpolated.rotation;
        this.#scale.x = this.interpolated.scale.x;
        this.#scale.y = this.interpolated.scale.y;

        this.container.setFromMatrix(this.#matrix());
        return;
      }

      this.#position = Vector2.smoothLerp(
        this.#position,
        this.interpolated.position,
        this.#lnsmooth,
        delta,
      );

      this.#rotation = smoothLerp(
        this.#rotation,
        this.interpolated.rotation,
        this.#lnsmooth,
        delta,
      );

      this.#scale = Vector2.smoothLerp(
        this.#scale,
        this.interpolated.scale,
        this.#lnsmooth,
        delta,
      );

      this.container.setFromMatrix(this.#matrix());
    });

    this.on(EntityDestroyed, () => {
      const game = this.game as ClientGame;

      // Deactivate camera
      this.active = false;

      // Reparent to pixi root
      game.renderer.app.stage.addChild(game.renderer.scene);
      // Destroy container after
      this.container.destroy();
    });

    this.zoom = 1 / this.globalTransform.scale.x;
    const zoom = this.defineValue(Camera, "zoom", { replicated: false });
    let zoomChanging = false;
    zoom.onChanged(() => {
      zoomChanging = true;
      this.globalTransform.scale = Vector2.ONE.mul(1 / this.zoom);
      zoomChanging = false;
    });
    this.on(EntityTransformUpdate, () => {
      if (zoomChanging) return;
      this.zoom = 1 / this.globalTransform.scale.x;
    });
  }

  public worldToScreen(position: IVector2): Vector2 {
    const game = this.game as ClientGame;

    let scale = 1;
    if (!this.unlocked) {
      const canvas = game.renderer.app.canvas;
      const w = canvas.width / Camera.METERS_TO_PIXELS;
      const h = canvas.height / Camera.METERS_TO_PIXELS;
      const axis = Math.min(w, h);
      scale = axis / Camera.TARGET_VIEWPORT_SIZE;
    }

    const matrix = PIXI.Matrix.shared
      .translate(-this.globalTransform.position.x, this.globalTransform.position.y)
      .rotate(this.#rotation)
      .scale(Camera.METERS_TO_PIXELS, Camera.METERS_TO_PIXELS)
      .scale(1 / (this.#scale.x / scale), 1 / (this.#scale.y / scale))
      .translate(game.renderer.app.canvas.width / 2, game.renderer.app.canvas.height / 2);

    const { x, y } = matrix.apply({ x: position.x, y: -position.y });
    return new Vector2(x, y);
  }

  public screenToWorld(position: IVector2): Vector2 {
    const game = this.game as ClientGame;

    let scale = 1;
    if (!this.unlocked) {
      const canvas = game.renderer.app.canvas;
      const w = canvas.width / Camera.METERS_TO_PIXELS;
      const h = canvas.height / Camera.METERS_TO_PIXELS;
      const axis = Math.min(w, h);
      scale = axis / Camera.TARGET_VIEWPORT_SIZE;
    }

    const matrix = PIXI.Matrix.shared
      .translate(-this.globalTransform.position.x, this.globalTransform.position.y)
      .rotate(this.#rotation)
      .scale(Camera.METERS_TO_PIXELS, Camera.METERS_TO_PIXELS)
      .scale(1 / (this.#scale.x / scale), 1 / (this.#scale.y / scale))
      .translate(game.renderer.app.canvas.width / 2, game.renderer.app.canvas.height / 2);

    const { x, y } = matrix.applyInverse(position);
    return new Vector2(x, -y);
  }
}
