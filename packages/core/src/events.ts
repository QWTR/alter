import { EventEmitter } from 'node:events';

export interface AlterEvent {
  type:
    | 'run.started'
    | 'run.activity'
    | 'run.finished'
    | 'monitor.changed'
    | 'memory.added'
    | 'studio.progress'
    | 'hands.session'
    | 'hands.action'
    | 'hands.stopped'
    | 'agent.changed'
    | 'project.changed'
    | 'conversation.updated'
    | 'provider.tested'
    | 'provider.progress'
    | 'project.scan'
    | 'usage.limit'
    | 'device.paired'
    | 'settings.changed'
    | 'notify'
    | 'plugins.changed'
    | 'squad.update' | 'hands.board' | 'crew.preview'
    | 'plugins.progress'
    | 'push.changed'
    | 'alert'
    | 'agent.status'
    | 'voice.progress'
    | 'media.updated'
    | 'prompts.changed'
    | 'update.available'
    | 'workspace.changed'
    | 'update.progress';
  data: unknown;
}

/** In-process bus; the server fans these out to every connected device (desktop + phones) over SSE. */
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emit(type: AlterEvent['type'], data: unknown): void {
  bus.emit('event', { type, data } satisfies AlterEvent);
}
