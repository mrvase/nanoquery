import {
  ResolvablePromise,
  createResolvablePromise,
} from "./resolvable-promise";
import {
  Suspendable,
  prefix,
  createSuspendable,
  EventContainer,
  local,
} from "./suspendable";
import { ActionRecord } from "./types";

const listeners: Record<string, Set<(...args: any) => any>> = {};
const awaitingPromises: Record<string, ResolvablePromise<void>> = {};

export const registerListeners = (...records: ActionRecord[]) => {
  let cleanup: (() => void)[] = [];

  records.forEach((record) => {
    const getKey = (prop: string) => [record[prefix], prop].join("/");

    for (const prop of Object.keys(record)) {
      const key = getKey(prop);
      let set = listeners[key];
      if (!set) {
        set = new Set();
        listeners[key] = set;
      }
      set.add(Object.assign(record[prop], { [local]: record[local] }));
      cleanup.push(() => set.delete(record[prop]));
      if (key in awaitingPromises) {
        awaitingPromises[key].resolve(undefined);
        delete awaitingPromises[key];
      }
    }
  });

  return () => {
    cleanup.forEach((cb) => cb());
  };
};

export const getSuspendableFromEvent = <T extends unknown>(
  container: EventContainer<T>
): Suspendable<T>[] => {
  const key = container.event.type;
  return [...(listeners[key] ?? [])].map((el) =>
    createSuspendable<T>(el, container)
  );
};

export const getSuspendableFromEventOrPromise = <T extends unknown>(
  container: EventContainer<T>
): [Suspendable<T>, ...Suspendable<T>[]] | [Promise<void>] => {
  const key = container.event.type;
  if (listeners[key] && listeners[key].size > 0) {
    return [...listeners[key]].map((el) =>
      createSuspendable<T>(el, container)
    ) as [Suspendable<T>, ...Suspendable<T>[]];
  } else {
    const promise = createResolvablePromise<void>();
    if (!awaitingPromises[key]) {
      awaitingPromises[key] = promise;
    }
    return [awaitingPromises[key]];
  }
};
