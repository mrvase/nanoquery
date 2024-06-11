import {
  QueryClient,
  QueryObserver,
  MutationObserver,
  type UseSuspenseQueryResult,
  useQuery as useQueryBase,
  useSuspenseQuery as useSuspenseQueryBase,
  useQueries as useQueriesBase,
  type MutationOptions,
  useMutation as useMutationBase,
  type DefaultError,
  type UseSuspenseQueryOptions,
  type QueryObserverResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  type Suspendable,
  isSuspendable,
  isSuspendableGuard,
  trackCommitContext,
  getCommitContext,
} from "./suspendable";
import {
  getSuspendableFromEventOrPromise,
  getSuspendableFromEvent,
} from "./listeners";
import { logger } from "#logger";
import { partialMatchKey } from "./utils";
import {
  type QueryEvent,
  ContextProp,
  type EventContainer,
  QueryEventType,
} from "./types";

const createClient = () => {
  const queryClient = new QueryClient();

  return {
    getQuery<T>(susp: Suspendable<T>) {
      return queryClient.getQueryCache().find<Awaited<T>>({
        queryKey: getQueryKey(susp.event),
        exact: true,
      });
    },
    fetchQuery<T>(susp: Suspendable<T>) {
      return queryClient.fetchQuery({
        queryKey: getQueryKey(susp.event),
        queryFn: susp.suspend().commit,
      }) as Promise<Awaited<T>>;
    },
    getQueryObserver<T>(event: Suspendable<T>, parent: QueryEvent) {
      return queryClient
        .getQueryCache()
        .find({
          queryKey: getQueryKey(event.event),
          exact: true,
        })
        ?.observers?.find((el) =>
          partialMatchKey(el.options.meta?.parent, parent)
        );
    },
    createQueryObserver<T>(
      sub: Suspendable<T>,
      parent: QueryEvent,
      options?: Partial<UseSuspenseQueryOptions<Awaited<T>>>
    ) {
      const observer = new QueryObserver<Awaited<T>>(
        queryClient,
        queryClient.defaultQueryOptions({
          ...getQueryOptions(sub),
          meta: {
            parent,
          },
          ...options,
        })
      );

      const cleanups: (() => void)[] = [];

      const destroy = () => {
        cleanupParentListener();
        cleanups.forEach((el) => el());
        observer.destroy();
      };

      const cleanupParentListener = queryClient
        .getQueryCache()
        .subscribe((event) => {
          if (
            event.type === "removed" &&
            partialMatchKey(getQueryKey(parent), event.query.queryKey)
          ) {
            destroy();
          }
        });

      return {
        subscribe(callback: (result: QueryObserverResult<Awaited<T>>) => void) {
          // observe when sub is removed

          const unsub = observer.subscribe(callback);
          cleanups.push(unsub);
        },
        get data() {
          return observer.getCurrentResult().data;
        },
      };
    },
    createMutationObserver<T>(event: Suspendable<T>) {
      return new MutationObserver<Awaited<T>>(
        queryClient,
        queryClient.defaultMutationOptions(getMutationOptions(event))
      );
    },
    invalidateQueries(event: QueryEvent, type: "topic" | "exact") {
      return queryClient.invalidateQueries({
        queryKey:
          type === "topic"
            ? event.type.split("/").slice(0, -1)
            : getQueryKey(event),
      });
    },
    queryClient,
  };
};

const client = createClient();

const getQueryKey = (event: QueryEvent): readonly any[] => {
  return [...event.type.split("/"), ...event.payload];
};

const getMutationKey = (event: QueryEvent): readonly any[] => {
  return [...event.type.split("/")];
};

const getQueryOptions = <T>(
  susp: Suspendable<T>
): UseSuspenseQueryOptions<Awaited<T>> => {
  const susp2 = susp.suspend();
  return {
    queryKey: getQueryKey(susp.event),
    queryFn: susp2.commit as () => Awaited<T> | Promise<Awaited<T>>,
    refetchOnMount: false,
    initialDataUpdatedAt: 0,
    ...(susp2.local
      ? {
          gcTime: 0,
          networkMode: "always",
        }
      : {}),
  };
};

const getMutationOptions = <T>(
  event: Suspendable<T>
): MutationOptions<Awaited<T>, any, any, any> => {
  const susp = event.suspend();
  const context = event[ContextProp];
  return {
    mutationKey: getMutationKey(event.event),
    mutationFn: susp.commit as () => Promise<Awaited<T>>,
    onMutate() {
      trackCommitContext(context, () => {
        susp.handleMutate();
      });
    },
    onError(error) {
      trackCommitContext(context, () => {
        susp.handleError(error);
      });
    },
    onSuccess(data) {
      trackCommitContext(context, () => {
        susp.handleSuccess(data);
      });
      invalidate(event.event);
    },
    retry: susp.retries || context?.retries,
    ...(susp.local ? { networkMode: "always" } : {}),
  };
};

const handleMutate = async <T>(event: Suspendable<T>) => {
  const context = event[ContextProp];
  const observer = client.createMutationObserver(event);
  return await observer.mutate();
};

export const mutate = <T>(event: EventContainer<T>) => {
  const susp = getSuspendableFromEvent(event);
  return Promise.all(susp.map((el) => handleMutate(el))).then(() => {});
};

export const useMutation = <T>(event: EventContainer<T>) => {
  const susp = getSuspendableFromEventOrPromise(event)[0];

  if (!isSuspendable(susp)) {
    throw susp;
  }

  return useMutationBase<Awaited<T>, DefaultError, void>(
    getMutationOptions(susp),
    client.queryClient
  );
};

export const dispatch = (event: EventContainer) => {
  return mutate(event);
};

const getInitialData = <T>(susp: Suspendable<T>) => {
  const susp2 = susp.suspend();
  if (!susp2.local) {
    return undefined;
  }
  const result = susp2.commit() as Awaited<T> | Promise<Awaited<T>>;
  if (result instanceof Promise) {
    susp2.save(result);
    return undefined;
  } else {
    return result;
  }
};

export const useQuery = <T>(
  event: EventContainer<T>,
  optionsFromArg?: Partial<
    Omit<
      UseQueryOptions<Awaited<T>>,
      "queryKey" | "queryFn" | "enabled" | "throwOnError"
    >
  >
): UseSuspenseQueryResult<Awaited<T>> => {
  const susp = getSuspendableFromEventOrPromise(event)[0];

  if (!isSuspendable(susp)) {
    throw susp;
  }

  const options: UseSuspenseQueryOptions<Awaited<T>> = {
    ...getQueryOptions(susp),
    ...optionsFromArg,
    initialData: () => getInitialData(susp),
  };

  const useHook = optionsFromArg?.placeholderData
    ? useQueryBase
    : useSuspenseQueryBase;
  return useHook<Awaited<T>>(
    options,
    client.queryClient
  ) as UseSuspenseQueryResult<Awaited<T>>;
};

type UnwrapContainers<T extends EventContainer<any>[]> = any[] extends T
  ? UseQueryResult<T[number]["event"][typeof QueryEventType]>[]
  : T extends [infer Head, ...infer Tail]
  ? Head extends EventContainer<any>
    ? [
        UseQueryResult<Head["event"][typeof QueryEventType]>,
        ...(Tail extends EventContainer<any>[] ? UnwrapContainers<Tail> : [])
      ]
    : []
  : [];

export const useQueries = <const T extends EventContainer<any>[]>(
  events: T,
  optionsFromArg?: Partial<
    Omit<
      UseQueryOptions<Awaited<T>>,
      "queryKey" | "queryFn" | "enabled" | "throwOnError"
    >
  >
): UnwrapContainers<T> => {
  const suspsPromises = events.map(
    (event) => getSuspendableFromEventOrPromise(event)[0]
  );

  if (suspsPromises.some((el) => !isSuspendable(el))) {
    throw Promise.all(suspsPromises);
  }

  const susps = suspsPromises as Suspendable<T>[];

  const optionsArray = susps.map(
    (susp): UseSuspenseQueryOptions<Awaited<T>> => {
      return {
        ...getQueryOptions(susp),
        ...optionsFromArg,
        initialData: () => getInitialData(susp),
      };
    }
  );

  return useQueriesBase({ queries: optionsArray }, client.queryClient);
};

export const invalidate = (eventFromArg?: QueryEvent) => {
  const event = getCommitContext()?.event ?? eventFromArg;
  if (event) {
    logger.events("invalidate!", {
      context: getCommitContext()?.event?.type?.split("/").slice(0, -1),
      arg: eventFromArg?.type?.split("/").slice(0, -1),
    });
    client.invalidateQueries(event, "topic");
  }
};

const resolve = <T>(result: unknown): Promise<T> => {
  let next = result;
  while (isSuspendableGuard(next)) {
    next = next.suspend().commit();
  }
  return Promise.resolve(next as T);
};

export const request = async <T>(
  event: EventContainer<T>
): Promise<T | undefined> => {
  const susp = getSuspendableFromEvent(event);
  if (susp.length === 0) {
    return undefined;
  }
  for (const el of susp) {
    const result = await resolve<T>(el);
    if (typeof result !== "undefined") {
      return result;
    }
  }
};

export const requestAll = <T>(event: EventContainer<T>) => {
  const susp = getSuspendableFromEvent(event);
  return Promise.all(susp.map((el) => resolve<T>(el)));
};

const invalidateContextOnChange = <T>(
  observed: Suspendable<T>,
  context: QueryEvent
) => {
  if (client.getQueryObserver(observed, context)) {
    return;
  }

  const observer = client.createQueryObserver(observed, context, {
    /*
    if refetchOnMount was true, it would fetch instantly and revalidate instantly
    the very function that is right now trying to subscribe to the event,
    thereby cancelling it (by throwing an error?)
    */
    refetchOnMount: false,
  });

  let updatedAt = 0;

  observer.subscribe((query) => {
    if (
      query.status === "success" &&
      query.fetchStatus === "idle" &&
      query.dataUpdatedAt > updatedAt
    ) {
      logger.events(
        "Data updated for:\n",
        observed.event,
        "\nInvalidates:\n",
        context
      );
      updatedAt = query.dataUpdatedAt;
      client.invalidateQueries(context, "exact");
    }
  });

  return observer.data;
};

export const query = <T>(
  event: EventContainer<T>
): Promise<Awaited<T>> | Awaited<T> => {
  const get = (susp: Suspendable<T>) => {
    const context = getCommitContext() ?? event[ContextProp];

    if (context) {
      const data = invalidateContextOnChange(susp, context.event);
      if (data) {
        return data;
      }
    }

    const query = client.getQuery(susp);

    if (query?.state.data) {
      return query.state.data;
    }

    if (query?.promise) {
      return query.promise;
    }

    const suspended = susp.suspend();
    const result = suspended.commit();
    if (!(result instanceof Promise)) {
      return result as Awaited<T>;
    }
    suspended.save(result);

    return client.fetchQuery(susp);
  };

  const susp = getSuspendableFromEventOrPromise(event)[0];
  return isSuspendable(susp) ? get(susp) : susp.then(get);
};
