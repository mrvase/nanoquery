import {
  type ResolvablePromise,
  createResolvablePromise,
} from "./resolvable-promise";
import {
  type Suspendable,
  prefix,
  createSuspendable,
  local,
  isSuspendable,
} from "./suspendable";
import type { ActionRecord, EventContainer } from "./types";

type Fn = (...args: any[]) => any;

const listeners: Record<string, Set<Fn>> = {};
const awaitingPromises: Record<string, ResolvablePromise<Fn>> = {};

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
      const fn = Object.assign(record[prop], { [local]: record[local] });
      set.add(fn);
      cleanup.push(() => set.delete(record[prop]));
      if (key in awaitingPromises) {
        awaitingPromises[key].resolve(fn);
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
  if (isSuspendable(container)) {
    return [container as Suspendable<T>];
  }
  const key = container.event.type;
  return [...(listeners[key] ?? [])].map((fn) =>
    createSuspendable<T>(fn, container)
  );
};

export const getSuspendableFromEventOrPromise = <T extends unknown>(
  container: EventContainer<T>
): [Suspendable<T>, ...Suspendable<T>[]] | [Promise<Suspendable<T>>] => {
  if (isSuspendable(container)) {
    return [container as Suspendable<T>];
  }
  const key = container.event.type;
  if (listeners[key] && listeners[key].size > 0) {
    return [...listeners[key]].map((el) =>
      createSuspendable<T>(el, container)
    ) as [Suspendable<T>, ...Suspendable<T>[]];
  } else {
    const promise = createResolvablePromise<Fn>();
    if (!awaitingPromises[key]) {
      awaitingPromises[key] = promise;
    }
    return [
      awaitingPromises[key].then((fn) => createSuspendable(fn, container)),
    ];
  }
};
