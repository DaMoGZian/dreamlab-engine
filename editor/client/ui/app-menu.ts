import { ClientGame, PlayerJoined, PlayerLeft } from "@dreamlab/engine";
import { DEFAULT_CODEC } from "@dreamlab/proto/codecs/mod.ts";
import { element as elem } from "@dreamlab/ui";
import { ArrowUpDown, Hammer, icon, OctagonX, Play, Save, User } from "../_icons.ts";
import { IconButton } from "../components/mod.ts";
import { connectToGame } from "../game-connection.ts";
import { setupGame } from "../game-setup.ts";
import { Ping } from "../networking/ping.ts";
import { InspectorUI } from "./inspector.ts";

export class AppMenu {
  #section = elem("section", { id: "app-menu" });

  playInspector: InspectorUI | undefined;
  private buttons: Record<string, IconButton> = {};

  constructor(
    private uiRoot: HTMLElement,
    private games: { edit: ClientGame; play?: ClientGame },
  ) {}

  setup(editUI: InspectorUI): void {
    const saveButton = new IconButton(Save, {
      id: "save-button",
      title: "Save",
      ariaLabel: "Save",
    });

    saveButton.addEventListener("click", async () => {
      const url = new URL(import.meta.env.SERVER_URL);
      url.pathname = `/api/v1/save-edit-session/${this.games.edit.instanceId}`;
      await fetch(url, { method: "POST" });
      // TODO: toast or something when the save goes through
    });

    this.buttons = {
      play: new IconButton(Play, {
        id: "play-button",
        title: "Play",
        ariaLabel: "Play",
      }),
      edit: new IconButton(Hammer, {
        id: "edit-button",
        title: "Edit",
        ariaLabel: "Edit",
      }),
      stop: new IconButton(OctagonX, {
        id: "stop-button",
        title: "Stop",
        ariaLabel: "Stop",
      }),
    };

    this.buttons.play.enable();
    this.buttons.edit.disable();
    this.buttons.stop.disable();

    this.buttons.play.addEventListener("click", async event => {
      event.preventDefault();

      // TODO: if someone spams this button we should still only connect once
      if (this.games.play === undefined) {
        await this.#connectToPlayGame(editUI);
      }

      editUI.hide();
      this.games.edit.container.style.display = "none";

      this.playInspector?.show(this.uiRoot);
      if (this.games.play) {
        this.games.play.container.style.display = "block";
        this.games.play.renderer.app.resize();
      }

      this.buttons.play.disable();
      this.buttons.edit.enable();
      this.buttons.stop.enable();
    });

    this.buttons.edit.addEventListener("click", event => {
      event.preventDefault();

      this.playInspector?.hide();
      if (this.games.play) this.games.play.container.style.display = "none";

      editUI.show(this.uiRoot);
      this.games.edit.container.style.display = "block";
      this.games.edit.renderer.app.resize();

      this.buttons.edit.disable();
      this.buttons.play.enable();
      this.buttons.stop.enable();
    });

    this.buttons.stop.addEventListener("click", async event => {
      event.preventDefault();

      await this.#stopPlayGame();

      this.buttons.stop.disable();
      this.buttons.edit.disable();
      this.buttons.play.enable();
    });

    this.#section.append(
      elem("div", {}, [elem("h1", {}, ["Dreamlab"]), saveButton]),
      elem("div", {}, Object.values(this.buttons)),
      elem("div", {}, [this.setupStats(this.games.edit)]),
    );

    const topBar = this.uiRoot.querySelector("#top-bar")!;
    topBar.append(this.#section);
  }

  setupStats(game: ClientGame): HTMLElement {
    const countText = document.createTextNode("1");
    const updateCount = () => {
      const count = game.network.connections.length;
      countText.textContent = count.toLocaleString();
    };

    game.on(PlayerJoined, () => updateCount());
    game.on(PlayerLeft, () => updateCount());
    updateCount();

    const pingText = document.createTextNode("0");
    game.on(Ping, ({ ping }) => (pingText.textContent = ping.toLocaleString()));

    // TODO: make this look nice lol
    return elem("div", { id: "stats" }, [
      elem("div", { id: "users", title: "Connected Users" }, [
        elem("span", {}, [countText]),
        icon(User),
      ]),
      elem("div", { id: "ping", title: "Ping" }, [
        elem("span", {}, [pingText, "ms"]),
        icon(ArrowUpDown),
      ]),
    ]);
  }

  async #connectToPlayGame(editUI: InspectorUI) {
    const container = document.createElement("div");
    this.uiRoot.querySelector("#viewport")!.append(container);

    const connectURL = new URL(import.meta.env.SERVER_URL);
    connectURL.pathname = `/api/v1/connect/${this.games.edit.instanceId}`;
    const player = this.games.edit.network.connections.find(
      c => c.id === this.games.edit.network.self,
    )!;
    // TODO: replace with token
    connectURL.searchParams.set("player_id", player.playerId);
    connectURL.searchParams.set("nickname", player.nickname);
    connectURL.searchParams.set("play_session", "1");

    const playSocket = new WebSocket(connectURL);
    playSocket.binaryType = "arraybuffer";

    const [playGame, conn, _handshake] = await connectToGame(
      this.games.edit.instanceId,
      container,
      playSocket,
      DEFAULT_CODEC,
    );

    playSocket.addEventListener("close", () => {
      if (this.games.play === playGame) this.games.play = undefined;
      playGame.container.remove();
      playGame.shutdown();
      this.playInspector?.hide();

      editUI.show(this.uiRoot);
      this.games.edit.container.style.display = "block";
      this.games.edit.renderer.app.resize();
    });

    await setupGame(playGame, conn, false);
    this.playInspector = new InspectorUI(playGame, conn, false, container);
    this.games.play = playGame;
  }

  #disconnectPlayGame() {
    if (!this.games.play) return;

    this.games.play.shutdown();
    this.games.play = undefined;
  }

  async #stopPlayGame() {
    if (!this.games.play) return;
    const url = new URL(import.meta.env.SERVER_URL);
    url.pathname = `/api/v1/stop-play-session/${this.games.play.instanceId}`;
    await fetch(url, { method: "POST" });
  }
}
