import { Scene } from "@dreamlab/scene";

import { WorkerIPCMessage } from "../server-common/ipc.ts";
import { GameSession } from "./session.ts";
import { LogStore } from "./util/log-store.ts";
import { IPCMessageListener } from "./worker.ts";
import { buildWorld } from "./world-build.ts";
import { fetchWorld } from "./world-fetch.ts";

import * as colors from "jsr:@std/fmt@1/colors";
import * as path from "jsr:@std/path@1";

export enum GameInstanceState {
  Idle,
  Starting,
  Running,
  Errored,
}

export interface GameInstanceInfo {
  instanceId: string;
  worldId: string;
  worldDirectory: string;
  // defaults to "origin/main"
  worldRevision?: string;
  // player id
  startedBy?: string;

  editMode?: boolean;

  inspect?: string;
}

export class GameInstance {
  static INSTANCES = new Map<string, GameInstance>();

  createdAt = new Date();
  #idleSince = this.createdAt;
  // prettier-ignore
  get idleSince() { return this.#idleSince; }

  bumpIdleTime() {
    this.#idleSince = new Date();
  }

  constructor(public info: GameInstanceInfo) {
    this.resetBooting();
    this.#printLogs();

    GameInstance.INSTANCES.set(info.instanceId, this);
  }

  // #region Logs
  logs = new LogStore();

  #printLogs() {
    const shortId = this.info.instanceId.substring(this.info.instanceId.length - 8);
    this.logs.subscribe().on(entry => {
      if (entry.level === "stdout" || entry.level === "stderr") return; // already handled by worker stdio forwarding code

      const separator = colors.black("|");
      const workerTag = colors.dim(`[worker …${shortId}]`);
      const levelColor = {
        debug: colors.gray,
        info: colors.green,
        warn: colors.yellow,
        error: colors.red,
      }[entry.level];
      const levelTag = levelColor(`${entry.level}`);

      let logMessage = `${workerTag} ${levelTag} ${separator} ${colors.brightWhite(
        entry.message,
      )}`;
      if (entry.detail !== undefined) {
        logMessage += ` ${separator}`;
        for (const [key, value] of Object.entries(entry.detail)) {
          logMessage += colors.dim(colors.italic(` ${key}`) + "=");
          logMessage += Deno.inspect(value, {
            colors: true,
            compact: true,
            breakLength: Infinity,
            strAbbreviateSize: Infinity,
          });
        }
      }
      console.log(logMessage);
    });
  }
  // #endregion

  // #region Status
  #state: GameInstanceState = GameInstanceState.Idle;
  #status: string = "Idle";
  #statusDetail: string | undefined;
  // prettier-ignore
  get state() { return this.#state; }
  // prettier-ignore
  get status() { return this.#status; }
  // prettier-ignore
  get statusDetail() { return this.#statusDetail; }
  setStatus(state: GameInstanceState, status: string, detail?: string) {
    this.#state = state;
    this.#status = status;
    this.#statusDetail = detail;

    this.logs.debug("Status updated", { ...{ status }, ...(detail ? { detail } : {}) });
    this.bumpIdleTime();
  }

  #notifyBooted: (() => void) | undefined;
  // deno-lint-ignore no-explicit-any
  #notifyBootFail: ((reason?: any) => void) | undefined;
  #bootedPromise: Promise<unknown> | undefined;
  #booting = false;
  resetBooting() {
    this.#booting = true;

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.#bootedPromise = promise;
    this.#notifyBooted = resolve;
    this.#notifyBootFail = reject;
  }
  notifySessionBoot() {
    if (!this.#booting) return;
    this.#notifyBooted?.();
    this.#booting = false;
  }
  // deno-lint-ignore no-explicit-any
  notifySessionBootFail(reason?: any) {
    if (!this.#booting) return;
    this.#notifyBootFail?.(reason);
    this.#booting = false;
  }
  async waitForSessionBoot() {
    if (!this.#booting) return;
    const err = await this.#bootedPromise;
    if (err) throw err;
  }

  #notifyPlayBooted: (() => void) | undefined;
  // deno-lint-ignore no-explicit-any
  #notifyPlayBootFail: ((reason?: any) => void) | undefined;
  #playBootedPromise: Promise<unknown> | undefined;
  #playBooting = false;
  resetPlayBooting() {
    this.#playBooting = true;
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.#playBootedPromise = promise;
    this.#notifyPlayBooted = resolve;
    this.#notifyPlayBootFail = reject;
  }
  notifyPlaySessionBoot() {
    if (!this.#playBooting) return;
    this.#notifyPlayBooted?.();
    this.#playBooting = false;
  }
  // deno-lint-ignore no-explicit-any
  notifyPlaySessionBootFail(reason?: any) {
    if (!this.#playBooting) return;
    this.#notifyPlayBootFail?.(reason);
    this.#playBooting = false;
  }
  async waitForPlaySessionBoot() {
    if (!this.#playBooting) return;
    const err = await this.#playBootedPromise;
    if (err) throw err;
  }
  // #endregion

  session?: GameSession;
  // only used in edit mode - running play session for the instance
  playSession?: GameSession;

  shutdown() {
    this.session?.shutdown();
    this.playSession?.shutdown();
    this.playSession = undefined;
    this.setStatus(GameInstanceState.Idle, "Shut down");
  }

  restart() {
    this.setStatus(GameInstanceState.Starting, "Restarting");
    this.session?.shutdown();
    this.playSession?.shutdown();
    this.playSession = undefined;
    bootInstance(this, true);
  }

  sendPlaySessionState() {
    this.session?.ipc.send({
      op: "PlaySessionState",
      running: this.playSession !== undefined,
      paused: this.playSession?.paused ?? false,
    });
  }
}

export const dumpSceneDefinition = async (instance: GameInstance): Promise<Scene> => {
  if (!instance.info.editMode) throw new Error("The given instance is not in edit mode!");
  if (!instance.session)
    throw new Error("The given instance is not currently running a session.");

  const ipc = instance.session.ipc;
  const scene: Scene = await new Promise(resolve => {
    const sceneDefListener = (
      message: WorkerIPCMessage & { op: "SceneDefinitionResponse" },
    ) => {
      resolve(message.sceneJson);
      ipc.removeMessageListener(sceneDefListener as IPCMessageListener["handler"]);
    };
    ipc.send({ op: "SceneDefinitionRequest" });
    ipc.addMessageListener("SceneDefinitionResponse", sceneDefListener);
  });

  return scene;
};

export const createInstance = (info: GameInstanceInfo): GameInstance => {
  const instance = new GameInstance(info);
  void bootInstance(instance).catch(err => {
    instance.logs.error("An error occurred while booting the instance", { err: err.stack });
    instance.setStatus(GameInstanceState.Errored, "Failed to start");
  });

  return instance;
};

export const bootInstance = async (instance: GameInstance, restart: boolean = false) => {
  instance.setStatus(
    GameInstanceState.Starting,
    restart ? "Restarting instance" : "Starting instance",
  );
  instance.resetBooting();

  instance.setStatus(GameInstanceState.Starting, "Fetching world");
  await fetchWorld(instance);

  try {
    instance.setStatus(GameInstanceState.Starting, "Building world scripts");
    await buildWorld(instance.info.worldId, instance.info.worldDirectory, "_dist");
  } catch (err) {
    instance.logs.error("Failed to build world bundle", { err: err.stack });
    instance.setStatus(GameInstanceState.Errored, "World script build failed", err.toString());
    instance.notifySessionBootFail();
    return;
  }

  instance.setStatus(GameInstanceState.Starting, "Starting session");
  const session = new GameSession(instance);
  instance.session = session;
  await session.ready();
  instance.setStatus(GameInstanceState.Running, "Started");
  instance.notifySessionBoot();
};

export const bootPlaySession = async (instance: GameInstance) => {
  if (!instance.info.editMode)
    throw new Error("Can't start a play session for an instance that isn't in edit mode!");
  if (instance.session === undefined)
    throw new Error("Can't start a play session without a running edit session!");

  instance.resetPlayBooting();

  instance.logs.debug("play: Fetching scene definition from edit session...");

  try {
    instance.logs.debug("play: Bundling world...");
    await buildWorld(instance.info.worldId, instance.info.worldDirectory, "_dist_play");
  } catch (err) {
    instance.logs.error("Failed to build world bundle for play session", { err: err.stack });
    instance.notifyPlaySessionBootFail();
    return;
  }

  try {
    instance.logs.debug("play: Writing scene definition to _dist_play directory");

    const scene = await dumpSceneDefinition(instance);

    const projectJsonFile = path.join(
      instance.info.worldDirectory,
      "_dist_play",
      "project.json",
    );
    const projectDesc = JSON.parse(await Deno.readTextFile(projectJsonFile));
    projectDesc.scenes = { ...(projectDesc.scenes ?? {}), main: scene };
    await Deno.writeTextFile(projectJsonFile, JSON.stringify(projectDesc, undefined, 2));
  } catch (err) {
    instance.logs.error("Failed to write scene definition for play session", {
      err: err.stack,
    });
    instance.notifyPlaySessionBootFail();
    return;
  }

  instance.logs.debug("play: Booting session...");
  const session = new GameSession(instance, {
    editMode: false,
    worldSubDirectory: "_dist_play",
  });
  instance.playSession = session;
  instance.sendPlaySessionState();
  session.ipc.addMessageListener("PauseChanged", () => {
    instance.sendPlaySessionState();
  });

  await session.ready();
  instance.notifyPlaySessionBoot();
};
