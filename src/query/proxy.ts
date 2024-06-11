import { logger } from "#logger";
import {
  createEvent,
  createEventContainer,
  createSuspendable,
  getCommitContext,
} from "./suspendable";
import {
  topic,
  type ActionRecord,
  type EventContainer,
  type Prettify,
  type UnionToIntersection,
} from "./types";

type WrapInPrefix<
  T extends Record<string, any>,
  U extends string | undefined
> = U extends `${infer First}/${infer Rest}`
  ? First extends string
    ? Rest extends string
      ? { [Key in First]: WrapInPrefix<T, Rest> }
      : never
    : never
  : U extends string
  ? { [K in U]: T }
  : never;

type Transform<T extends Omit<ActionRecord, typeof topic>> = {
  [K in keyof T]: (
    ...args: Parameters<T[K]>
  ) => EventContainer<ReturnType<T[K]>>;
} & {};

export type ProxyClient<
  T extends ActionRecord,
  P extends string = T[typeof topic]
> = WrapInPrefix<Transform<Omit<T, typeof topic>>, P>;

type IsApiRecord<T> = T extends ActionRecord ? T : never;

export type ProxyClientIntersection<T extends ActionRecord> = Prettify<
  UnionToIntersection<
    {
      [Key in T[typeof topic]]: ProxyClient<
        IsApiRecord<UnionToIntersection<Extract<T, { [topic]: Key }>>>,
        Key
      >;
    }[T[typeof topic]]
  >
>;

export const proxyClient = <T extends ActionRecord>() => {
  return proxyClientBase() as ProxyClientIntersection<T>;
};

export const proxy = <
  T extends ActionRecord,
  U extends string = T[typeof topic]
>(
  client: T,
  pfx?: U
) => {
  return proxyClientBase(client, pfx);
};

const proxyClientBase = <
  T extends ActionRecord,
  U extends string = T[typeof topic]
>(
  client?: T,
  pfx?: U
): ProxyClient<T, U> => {
  const record: Record<string, (...args: any) => any> = {};
  if (client) {
    for (const prop of Object.keys(client)) {
      record[[pfx ?? client[topic], prop].join("/")] = client[prop];
    }
  }

  const createProxy = (
    context_: ReturnType<typeof getCommitContext>,
    path: string[] = []
  ): any => {
    const context = context_ ?? getCommitContext();

    return new Proxy(
      (...args: any[]): EventContainer<any> => {
        const event = createEvent(path, args);
        const fn = record[event.type];
        const container = createEventContainer(event, context);
        logger.events(
          "EVENT:",
          event,
          "\ntriggered from:",
          context?.event,
          Boolean(fn)
        );
        if (fn) {
          const suspendable = createSuspendable(fn, container);
          return suspendable;
        }
        return container;
      },
      {
        get(_, key) {
          return createProxy(context, [...path, key as string]);
        },
      }
    );
  };

  return createProxy(getCommitContext());
};
