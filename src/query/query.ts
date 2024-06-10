import {
  QueryClient,
  QueryObserver,
  MutationObserver,
  UseSuspenseQueryResult,
  useSuspenseQuery as useQueryBase,
  MutationOptions,
  useMutation as useMutationBase,
  DefaultError,
  UseSuspenseQueryOptions,
} from "@tanstack/react-query";
import {
  EventDataProp,
  EventContainer,
  QueryEvent,
  Suspendable,
  isSuspendable,
  isSuspendableGuard,
  EventData,
  trackCommitContext,
  getCommitContext,
  local,
} from "./suspendable";
import {
  getSuspendableFromEventOrPromise,
  getSuspendableFromEvent,
} from "./listeners";
import { logger } from "#logger";

export const queryClient = new QueryClient();

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
    ...(susp2[local]
      ? {
          gcTime: 0,
          networkMode: "always",
        }
      : {}),
  };
};

const subscribeInvalidation = <T>(
  subscribeTo: Suspendable<T>,
  invalidateEvent: QueryEvent
) => {
  const observerExists = queryClient
    .getQueryCache()
    .find({
      queryKey: getQueryKey(subscribeTo.event),
      exact: true,
    })
    ?.observers.some((el) =>
      partialMatchKey(el.options.meta?.source, invalidateEvent)
    );

  if (observerExists) {
    return;
  }

  const observer = new QueryObserver<Awaited<T>>(
    queryClient,
    queryClient.defaultQueryOptions({
      ...getQueryOptions(subscribeTo),
      /*
      if refetchOnMount was true, it would fetch instantly and revalidate instantly
      the very function that is right now trying to subscribe to the event,
      thereby cancelling it (by throwing an error?)
       */
      refetchOnMount: false,
      meta: {
        source: invalidateEvent,
      },
    })
  );

  const destroy = () => {
    unsub1();
    unsub2();
    observer.destroy();
  };

  let updatedAt = 0;

  const unsub1 = observer.subscribe((query) => {
    if (query.data && query.dataUpdatedAt > updatedAt) {
      logger.events(
        "invalidate from observer",
        invalidateEvent,
        subscribeTo.event
      );
      updatedAt = query.dataUpdatedAt;
      queryClient.invalidateQueries({
        queryKey: getQueryKey(invalidateEvent),
      });
    }
  });

  // observe when sub is removed
  const unsub2 = queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type === "removed" &&
      partialMatchKey(getQueryKey(invalidateEvent), event.query.queryKey)
    ) {
      destroy();
    }
  });

  return observer.getCurrentResult().data;
};

const getMutationOptions = <T>(
  mutationEvent: Suspendable<T>
): MutationOptions<Awaited<T>, any, any, any> => {
  const susp = mutationEvent.suspend();
  const context = mutationEvent[EventDataProp].context;
  return {
    mutationKey: getMutationKey(mutationEvent.event),
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
      logger.events("invalidate from success");
      invalidate(mutationEvent.event);
    },
    retry: susp.retries || context?.retries,
    ...(susp[local] ? { networkMode: "always" } : {}),
  };
};

export const handleMutate = async <T>(mutationEvent: Suspendable<T>) => {
  const context = mutationEvent[EventDataProp].context;

  const observer = new MutationObserver<Awaited<T>>(
    queryClient,
    queryClient.defaultMutationOptions(getMutationOptions(mutationEvent))
  );

  return await observer.mutate();
};

export const mutate = <T>(event: EventContainer<T>) => {
  const susp = isSuspendable(event) ? [event] : getSuspendableFromEvent(event);
  return Promise.all(susp.map((el) => handleMutate(el))).then(() => {});
};

export const useMutation = <T>(event: EventContainer<T>) => {
  const susp = isSuspendable(event)
    ? (event as Suspendable<T>)
    : getSuspendableFromEventOrPromise(event)[0];

  if (!isSuspendable(susp)) {
    throw susp;
  }

  return useMutationBase<Awaited<T>, DefaultError, void>({
    ...getMutationOptions(susp),
  });
};

(window as any).CLIENT = queryClient;

export const dispatch = (event: EventContainer) => {
  return mutate(event);
};

export const useQuery = <T>(
  event: EventContainer<T>
): UseSuspenseQueryResult<Awaited<T>> => {
  const susp = isSuspendable(event)
    ? (event as Suspendable<T>)
    : getSuspendableFromEventOrPromise(event)[0];

  if (!isSuspendable(susp)) {
    throw susp;
  }

  const susp2 = susp.suspend();

  const options: UseSuspenseQueryOptions<Awaited<T>> = {
    ...getQueryOptions(susp),
    initialData: () => {
      if (!susp2[local]) {
        return undefined;
      }
      const result = susp2.commit() as Awaited<T> | Promise<Awaited<T>>;
      if (isSuspendableGuard(result)) {
        return undefined;
      } else if (result instanceof Promise) {
        susp2.save(result);
        return undefined;
      } else {
        return result;
      }
    },
  };

  return useQueryBase<Awaited<T>>(options);
};

export const invalidate = (eventFromArg?: QueryEvent) => {
  const event = getCommitContext()?.event ?? eventFromArg;
  if (event) {
    logger.events(
      "invalidate from context",
      event.type.split("/").slice(0, -1)
    );
    queryClient.invalidateQueries({
      queryKey: event.type.split("/").slice(0, -1),
    });
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
  const susp = isSuspendable(event) ? [event] : getSuspendableFromEvent(event);
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
  const susp = isSuspendable(event) ? [event] : getSuspendableFromEvent(event);
  return Promise.all(susp.map((el) => resolve<T>(el)));
};

export function partialMatchKey(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (a && b && typeof a === "object" && typeof b === "object") {
    return !Object.keys(b).some((key) => !partialMatchKey(a[key], b[key]));
  }

  return false;
}

export const query = <T>(
  event: EventContainer<T>
): Promise<Awaited<T>> | Awaited<T> => {
  const get = (susp: Suspendable<T>) => {
    const susp2 = susp.suspend();
    const context =
      getCommitContext() ?? (event[EventDataProp] as EventData).context;

    let data: Awaited<T> | undefined;

    if (context) {
      data = subscribeInvalidation(susp, context.event);
    }

    const query = queryClient.getQueryCache().find<Awaited<T>>({
      queryKey: getQueryKey(susp.event),
      exact: true,
    });

    data = data ?? query?.state.data;

    if (typeof data !== "undefined") {
      return data;
    }

    if (query) {
      // if status but no data, then we assume there is a promise
      return query.promise!;
    }

    const result = susp2.commit();

    if (!(result instanceof Promise)) {
      return result as Awaited<T>;
    }

    susp2.save(result);

    const promise = queryClient.fetchQuery({
      queryKey: getQueryKey(susp.event),
      queryFn: susp2.commit,
    }) as Promise<Awaited<T>>;

    return promise;
  };

  if (isSuspendable(event)) {
    return get(event);
  }

  const susp = getSuspendableFromEventOrPromise(event)[0];

  if (!isSuspendable(susp)) {
    return susp.then(() => get(getSuspendableFromEvent(event)[0]));
  }

  return get(susp);
};
