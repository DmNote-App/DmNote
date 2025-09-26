import { IpcMainEvent, IpcMainInvokeEvent, ipcMain } from "electron";
import { windowRegistry } from "@main/core/windowRegistry";

export type InvokeHandler<TRequest = unknown, TResponse = unknown> = (
  request: TRequest,
  event: IpcMainInvokeEvent
) => Promise<TResponse> | TResponse;

export type EventHandler<TPayload = unknown> = (
  payload: TPayload,
  event: IpcMainEvent
) => void;

// IPC 채널 등록/브로드캐스트 헬퍼
class IpcRouter {
  handle<TRequest = unknown, TResponse = unknown>(
    channel: string,
    handler: InvokeHandler<TRequest, TResponse>
  ) {
    ipcMain.handle(channel, (event, request) => handler(request as TRequest, event));
  }

  on<TPayload = unknown>(channel: string, handler: EventHandler<TPayload>) {
    ipcMain.on(channel, (event, payload) => handler(payload as TPayload, event));
  }

  removeHandlers(channel: string) {
    ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners(channel);
  }

  emit(channel: string, payload?: unknown) {
    windowRegistry.broadcast(channel, payload);
  }

  emitTo(id: string, channel: string, payload?: unknown) {
    windowRegistry.send(id, channel, payload);
  }
}

export const ipcRouter = new IpcRouter();
