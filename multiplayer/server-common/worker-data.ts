export interface WorkerInitData {
  workerId: string;
  workerConnectUrl: string;

  worldResourcesBaseUrl: string;
  worldDirectory: string;
  instanceId: string;
  worldId: string;

  editMode: boolean;
}
