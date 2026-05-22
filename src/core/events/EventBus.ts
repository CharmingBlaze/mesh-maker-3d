type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Handler<unknown>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const set = this.listeners.get(event)!;
    set.add(handler as Handler<unknown>);
    return () => set.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((h) => (h as Handler<Events[K]>)(payload));
  }
}

import type { BoundingBox } from '@/core/math/BoundingBox';

export type EditorEvents = {
  'scene:changed': void;
  'selection:changed': void;
  'tool:changed': string;
  'viewport:render': void;
  'viewport:frame3d': BoundingBox | null;
};

export const editorEvents = new EventBus<EditorEvents>();
