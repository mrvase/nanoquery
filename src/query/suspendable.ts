import { ActionRecord } from "./types";

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type QueryEvent<Returned = unknown> = {
  type: string;
  payload: any[];
  [QueryEventType]: Returned;
};

type Unsuspended<T> = T extends null | undefined
  ? T // special case for `null | undefined` when not in `--strictNullChecks` mode
  : T extends object & { commit(): infer R } // `await` only unwraps object types with a callable `then`. Non-object types are not unwrapped
  ? Unsuspended<R> // the argument to `then` was not callable
  : T; // non-object or non-thenable

declare const QueryEventType: unique symbol;
export const EventDataProp = Symbol("commit-key");

export type EventData = {
  context?: CommitContext;
  mutateListeners: (() => void)[];
  successListeners: ((res: any) => void)[];
  failureListeners: ((err: unknown) => void)[];
  retries: number;
};

export type EventContainer<T = unknown> = {
  event: QueryEvent<T>;
  onMutate: (callback: () => void) => EventContainer<T>;
  onSuccess: (callback: (res: T) => void) => EventContainer<T>;
  onError: (callback: (err: unknown) => void) => EventContainer<T>;
  retry: (number: number) => EventContainer<T>;
  [EventDataProp]: unknown;
};

export type Suspendable<T = unknown> = EventContainer<T> & {
  suspend: () => {
    commit: () => T;
    save: (value: Promise<Awaited<T>>) => void;
    handleMutate: () => void;
    handleSuccess: (data: T) => void;
    handleError: (err: unknown) => void;
    retries: number;
    [local]?: boolean;
  };
  isAsync: () => boolean | null;
  [EventDataProp]: EventData;
  // then<U = T>(callback: (value: T) => U): Suspendable<U>;
};

export const isSuspendableGuard = (el: unknown): el is Suspendable<any> => {
  return typeof el === "object" && el !== null && "suspend" in el;
};

export const isSuspendable = <T>(el: T): el is Extract<T, Suspendable<any>> => {
  return isSuspendableGuard(el);
};

export type CommitContext = {
  event: QueryEvent;
  fn: (...args: any) => any;
  retries: number;
};
let COMMIT_CONTEXT: CommitContext | null = null;

export const trackCommitContext = <T>(
  context: CommitContext | null | undefined,
  func: () => T
): T => {
  const prev = COMMIT_CONTEXT;
  COMMIT_CONTEXT = context ?? null;
  const result = func();
  COMMIT_CONTEXT = prev;
  return result;
};

export const getCommitContext = () => {
  return COMMIT_CONTEXT;
};

export const prefix = Symbol("prefix");
export const local = Symbol("local");

export function createEvent<T>(type: string[], payload: any[]): QueryEvent<T> {
  return {
    type: type.join("/"),
    payload,
  } as QueryEvent<T>;
}

export function createEventContainer<T>(
  event: QueryEvent<T>,
  data?: Partial<EventData>
): EventContainer<T> {
  let retry = 0;
  const mutateListeners: (() => void)[] = [];
  const successListeners: ((res: any) => void)[] = [];
  const failureListeners: ((err: unknown) => void)[] = [];

  const object = {
    event,
    onMutate(callback: () => void) {
      mutateListeners.push(callback);
      return this;
    },
    onSuccess(callback: (res: Awaited<T>) => void) {
      successListeners.push(callback);
      return this;
    },
    onError(callback: (err: unknown) => void) {
      failureListeners.push(callback);
      return this;
    },
    retry(number: number) {
      retry = number;
      return this;
    },
    [EventDataProp]: {
      ...data,
      mutateListeners,
      successListeners,
      failureListeners,
      get retries() {
        return retry;
      },
    } satisfies EventData,
  };

  return object;
}

export function createSuspendable<T>(
  fn: ((...payload: any) => T) & { [local]?: boolean },
  container: EventContainer<T>
) {
  const event = container.event;
  let isAsync = (): boolean | null => null;
  let savedPromise: Promise<any> | null = null;

  const data = container[EventDataProp] as EventData;
  const handleMutate = () => {
    data.mutateListeners.forEach((cb) => cb());
  };
  const handleSuccess = <T>(res: T) => {
    data.successListeners.forEach((cb) => cb(res));
  };
  const handleError = (err: unknown) => {
    data.failureListeners.forEach((cb) => cb(err));
  };

  const commit = () => {
    if (savedPromise) {
      const saved = savedPromise;
      savedPromise = null;
      return saved;
    }

    const context = {
      event,
      fn,
      retries: data.retries,
    };

    const result = trackCommitContext(context, () => fn(...event.payload));

    if (isSuspendableGuard(result)) {
      isAsync = result.isAsync;
    } else if (result instanceof Promise) {
      isAsync = () => true;
    } else {
      isAsync = () => false;
    }
    return result;
  };

  const save = (p: Promise<any>) => {
    if (isSuspendableGuard(p)) {
      throw new Error("No strategy implemented for nested suspendables");
    } else {
      isAsync = () => true;
    }
    savedPromise = p;
  };

  const suspended = {
    commit,
    save,
    handleMutate,
    handleSuccess,
    handleError,
    get retries() {
      return data.retries;
    },
    [local]: fn[local],
  };

  const promise: Suspendable<Unsuspended<any>> = {
    ...container,
    [EventDataProp]: container[EventDataProp] as EventData,
    suspend: () => {
      return suspended;
    },
    /*
    then<U>(callback: (value: T | Suspendable<T> | PromiseLike<T>) => U) {
      return callback(commit());
    },
    */
    get isAsync() {
      return isAsync;
    },
  };
  return promise;
}

/*
export type APIClient<
  T extends APIRecord = APIRecord,
  U extends string[] = string[]
> = Prettify<
  {
    [K in Exclude<keyof T, typeof prefix>]: ReturnType<T[K]> extends Suspendable
      ? T[K]
      : (
          ...args: Parameters<T[K]>
        ) => Suspendable<Unsuspended<ReturnType<T[K]>>>;
  } & { [prefix]?: U }
>;
*/

export const createClient = <T extends ActionRecord, const U extends string>(
  methods: T,
  options: { prefix: U }
) => {
  const client = methods;

  return {
    ...client,
    [prefix]: options.prefix,
  } as Prettify<T & { [prefix]: U }>;
};

/*
class SuspendablePromise<T> extends Promise<T> {
  private dependencies: SuspendablePromise<any>[] = [];
  private suspended = false;

  func: () => T | Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;

  constructor(func: () => T | Promise<T>, deps?: SuspendablePromise<any>[]) {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    super((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.resolve = resolve!;
    this.reject = reject!;

    this.func = func;
    if (deps) {
      this.dependencies = deps;
    }

    queueMicrotask(() => {
      if (this.suspended) return;
      this.resolve(func());
    });
  }

  optimistic<U>(arg: (value: T | undefined) => U) {
    return new SuspendablePromise<U>(() => {
      const maybePromise = this.func();
      if (maybePromise instanceof Promise) {
        return maybePromise.then(arg);
      }
      return arg(maybePromise);
    }, [this]);
  }

  static all() {
    return new SuspendablePromise<>();
  }
}

SuspendablePromise.all();
*/

type JoinEventType<T extends string[]> = T extends [infer A, ...infer B]
  ? A extends string
    ? B extends [string]
      ? `${A}/${B[0]}`
      : B extends string[]
      ? `${A}/${JoinEventType<B>}`
      : A
    : A
  : "";

export type InferEvent<
  T extends ActionRecord,
  P extends string | undefined = T[typeof prefix]
> = {
  [K in Extract<keyof T, string>]: {
    type: P extends string ? `${P}/${K}` : K;
    payload: Parameters<T[K]>;
  };
}[Extract<keyof T, string>];
