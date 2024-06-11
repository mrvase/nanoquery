import {
  type ActionRecord,
  type CommitContext,
  type EventContainer,
  type Prettify,
  type QueryEvent,
  ContextProp,
  EventDataProp,
  local,
  topic,
} from "./types";

export type EventData = {
  mutateListeners: (() => void)[];
  successListeners: ((res: any) => void)[];
  failureListeners: ((err: unknown) => void)[];
  retries: number;
};

export type Suspendable<T = unknown> = EventContainer<T> & {
  suspend: () => {
    commit: () => T;
    save: (value: Promise<Awaited<T>>) => void;
    handleMutate: () => void;
    handleSuccess: (data: T) => void;
    handleError: (err: unknown) => void;
    retries: number;
    local: boolean;
  };
  // then<U = T>(callback: (value: T) => U): Suspendable<U>;
};

export const isSuspendableGuard = (el: unknown): el is Suspendable<any> => {
  return typeof el === "object" && el !== null && "suspend" in el;
};

export const isSuspendable = <T>(el: T): el is Extract<T, Suspendable<any>> => {
  return isSuspendableGuard(el);
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

export function createEvent<T>(type: string[], payload: any[]): QueryEvent<T> {
  return {
    type: type.join("/"),
    payload,
  } as QueryEvent<T>;
}

export function createEventContainer<T>(
  event: QueryEvent<T>,
  context: CommitContext | null
): EventContainer<T> {
  const data: EventData = {
    mutateListeners: [],
    successListeners: [],
    failureListeners: [],
    retries: 0,
  };

  const object = {
    event,
    onMutate(callback: () => void) {
      data.mutateListeners.push(callback);
      return this;
    },
    onSuccess(callback: (res: Awaited<T>) => void) {
      data.successListeners.push(callback);
      return this;
    },
    onError(callback: (err: unknown) => void) {
      data.failureListeners.push(callback);
      return this;
    },
    retry(number: number) {
      data.retries = number;
      return this;
    },
    [EventDataProp]: data,
    [ContextProp]: context,
  };

  return object;
}

export function createSuspendable<T>(
  fn: ((...payload: any) => T) & { [local]?: boolean },
  container: EventContainer<T>
) {
  let savedPromise: Promise<any> | null = null;

  const event = container.event;
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
      return saved as T;
    }

    const context = {
      event,
      retries: data.retries,
    };

    return trackCommitContext(context, () => fn(...event.payload));
  };

  const save = (p: Promise<Awaited<T>>) => {
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
    local: Boolean(fn[local]),
  };

  const promise: Suspendable<T> = {
    ...container,
    suspend: () => {
      return suspended;
    },
  };
  return promise;
}

export const createClient = <T extends ActionRecord, const U extends string>(
  methods: T,
  options: { prefix: U }
) => {
  const client = methods;

  return {
    ...client,
    [topic]: options.prefix,
  } as Prettify<T & { [topic]: U }>;
};

type JoinEventType<T extends string[]> = T extends [infer A, ...infer B]
  ? A extends string
    ? B extends [string]
      ? `${A}/${B[0]}`
      : B extends string[]
      ? `${A}/${JoinEventType<B>}`
      : A
    : A
  : "";
