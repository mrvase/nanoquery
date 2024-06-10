import { prefix, local } from "./suspendable";

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type UnionToIntersection<U> = (
  U extends any ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

export type ActionRecord<TPrefix extends string = string> = {
  [key: string]: (...args: any[]) => any;
  [prefix]: TPrefix;
  [local]?: boolean;
};

export type Actions<
  T extends ActionRecord = ActionRecord,
  Prefix extends string | undefined = T[typeof prefix]
> = {
  [K in Extract<keyof T, string>]: (
    ...input: Parameters<T[K]>
  ) => Awaited<ReturnType<T[K]>> | Promise<Awaited<ReturnType<T[K]>>>;
} & {
  [prefix]: Prefix;
  [local]?: boolean;
};

declare const QueryEventType: unique symbol;
export const EventDataProp = Symbol("event-data");
export const ContextProp = Symbol("context");

export type QueryEvent<Returned = unknown> = {
  type: string;
  payload: any[];
  [QueryEventType]: Returned;
};

export type CommitContext = {
  event: QueryEvent;
  retries: number;
};

export type EventContainer<T = unknown> = {
  event: QueryEvent<T>;
  onMutate: (callback: () => void) => EventContainer<T>;
  onSuccess: (callback: (res: T) => void) => EventContainer<T>;
  onError: (callback: (err: unknown) => void) => EventContainer<T>;
  retry: (number: number) => EventContainer<T>;
  [EventDataProp]: unknown;
  [ContextProp]: CommitContext | null;
};
