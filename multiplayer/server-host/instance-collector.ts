// ive become the grim reapers housewife

import { GameInstance } from "./instance.ts";

const instanceCollectorTask = () => {
  for (const instance of [...GameInstance.INSTANCES.values()]) {
    if (instance.info.editMode) continue;

    // instances bump idle time whenever a session gets a ping packet,
    // so we don't need to check player count.

    const THREE_HOURS = 3 * 60 * 60 * 1000;
    const idleTime = Date.now() - instance.idleSince.getTime();
    if (idleTime > THREE_HOURS) {
      instance.logs.info("instance reaper: instance idled too long! shutting down", {
        idleTime,
      });
      instance.shutdown();
      GameInstance.INSTANCES.delete(instance.info.instanceId);
    }
  }
};

export const startInstanceCollector = () => {
  setInterval(instanceCollectorTask, 30_000);
};
