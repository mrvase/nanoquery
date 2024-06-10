import { logger } from "#logger";
import {
  EventContainer,
  createEvent,
  prefix,
  createEventContainer,
  createSuspendable,
  getCommitContext,
} from "./suspendable";
import { ActionRecord } from "./types";

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

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

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

type Transform<T extends Omit<ActionRecord, typeof prefix>> = {
  [K in keyof T]: (
    ...args: Parameters<T[K]>
  ) => EventContainer<ReturnType<T[K]>>;
} & {};

export type ProxyClient<
  T extends ActionRecord,
  P extends string = T[typeof prefix]
> = WrapInPrefix<Transform<Omit<T, typeof prefix>>, P>;

export type ProxyClientIntersection<T extends ActionRecord> = Prettify<
  UnionToIntersection<
    {
      [Key in T[typeof prefix]]: ProxyClient<
        Extract<T, { [prefix]: Key }>,
        Key
      >;
    }[T[typeof prefix]]
  >
>;

/*
export type InferEvents<
  T extends Record<string, (...args: any) => Suspendable<any>> & {
    [prefix]?: string[];
  }
> = UnionToIntersection<
  WrapInPrefix<
    {
      [K in Exclude<keyof T, typeof prefix>]: (
        ...args: Parameters<T[K]>
      ) => FunctionalEvent<ReturnType<ReturnType<T[K]>["commit"]>>;
    },
    T[typeof prefix]
  >
>;
*/

export const proxyClient = <T extends ActionRecord>() => {
  return proxyClientBase() as ProxyClientIntersection<T>;
};

export const proxy = <
  T extends ActionRecord,
  U extends string = T[typeof prefix]
>(
  client: T,
  pfx?: U
) => {
  return proxyClientBase(client, pfx);
};

const proxyClientBase = <
  T extends ActionRecord,
  U extends string = T[typeof prefix]
>(
  client?: T,
  pfx?: U
): ProxyClient<T, U> => {
  const record: Record<string, (...args: any) => any> = {};
  if (client) {
    for (const prop of Object.keys(client)) {
      record[[pfx ?? client[prefix], prop].join("/")] = client[prop];
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
        const container = createEventContainer(
          event,
          context ? { context } : undefined
        );
        logger.events(
          "EVENT:",
          event,
          "triggered from:",
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
          if (key === "__path__") {
            return path;
          }
          return createProxy(context, [...path, key as string]);
        },
      }
    );
  };

  return createProxy(getCommitContext());
};