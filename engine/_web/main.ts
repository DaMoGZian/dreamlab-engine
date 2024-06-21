import { Camera, ClientGame } from "../mod.ts";
import { generateCUID } from "@dreamlab/vendor/cuid.ts";

// #region Setup
// @ts-expect-error global
if (IS_DEV) {
  new EventSource("/esbuild").addEventListener("change", () => location.reload());
}

const container = document.createElement("div");
document.body.append(container);
container.style.width = "1280px";
container.style.height = "720px";

const game = new ClientGame({
  instanceId: "0",
  worldId: "dummy-world",
  connectionId: generateCUID("conn"),
  container,
});

await game.initialize();
const camera = game.local.spawn({
  type: Camera,
  name: "Camera",
});

declare global {
  const game: ClientGame;
  const camera: Camera;
}

Object.assign(window, { game, camera });
// #endregion

const mod = await import("./test-cases/wasd-ui.ts");
Object.assign(window, { ...mod });

// #region Tick loop
let now = performance.now();
const onTick = (time: number) => {
  const delta = time - now;
  now = time;
  game.tickClient(delta);

  requestAnimationFrame(onTick);
};

requestAnimationFrame(onTick);
// #endregion
