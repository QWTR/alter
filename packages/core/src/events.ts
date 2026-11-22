import { EventEmitter } from 'node:events';

export interface AlterEvent {
  type:
    | 'run.started'
    | 'run.finished'
    | 'memory.added'
    | 'agent.changed'
    | 'conversation.updated'
    | 'device.paired'
    | 'settings.changed';
  data: unknown;
}

/** In-process bus; the server fans these out to every connected device (desktop + phones) over SSE. */
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emit(type: AlterEvent['type'], data: unknown): void {
  bus.emit('event', { type, data } satisfies AlterEvent);
}
