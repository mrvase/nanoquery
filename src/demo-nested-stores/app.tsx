import { Suspense, useReducer, useSyncExternalStore } from "react";
import { registerListeners } from "../query";
import { topic } from "../query";
import { mutate, query, useQuery } from "../query";
import { proxyClient } from "../query";

// listen to events

const store1Client = (value = 1) => ({
  [topic]: "store1" as const,
  getValue: () => {
    console.log("get!", value);
    return value;
  },
  valueIncremented: () => {
    value++;
    console.log("incremented!", value);
  },
  /*
  valueIncremented: () =>
    new Promise((res) => setTimeout(() => res(value++), 400)),
  */
});
type Store1 = ReturnType<typeof store1Client>;

const { store1, store2, store3, store4 } = proxyClient<
  Store1 | Store2 | Store3 | Store4
>();

const store2Client = {
  [topic]: "store2" as const,
  getValue: async () => {
    const { store1 } = proxyClient<Store1>();
    const value = await query(store1.getValue());
    return value;
  },
};
type Store2 = typeof store2Client;

const store3Client = {
  [topic]: "store3" as const,
  getValue: () => {
    const value = store2.getValue();
    return query(value);
  },
};
type Store3 = typeof store3Client;

const store4Client = {
  [topic]: "store4" as const,
  getValue: () => {
    const value = query(store3.getValue());
    return value;
  },
};
type Store4 = typeof store4Client;

registerListeners(store1Client(), store2Client, store3Client, store4Client);

export function AppNestedStores() {
  return (
    <div className="w-full h-full flex p-5 gap-5">
      <Suspense fallback="Loading...">
        <Show />
        <Show3 />
      </Suspense>
    </div>
  );
}

const micro = () => {
  const queue = (i = 0) => {
    if (i >= 100) {
      return;
    }
    queueMicrotask(() => {
      console.log("QUEUED!");
      queue(++i);
    });
  };
  queue();
};

function Show() {
  const { data: value1 } = useQuery(store1.getValue());
  const { data: value2 } = useQuery(store2.getValue());
  const { data: value3 } = useQuery(store3.getValue());
  const { data: value4 } = useQuery(store4.getValue());

  console.log({ value1, value2, value3, value4 });

  return (
    <>
      <div>
        {value1} {value2} {value3} {value4}
      </div>
      <button
        onClick={() => {
          mutate(store1.valueIncremented());
          micro();
        }}
      >
        Increment
      </button>
    </>
  );
}

function Show2() {
  const [value1, increment1] = useReducer((value) => value + 1, 1);
  const [value2, increment2] = useReducer((value) => value + 1, 1);
  const [value3, increment3] = useReducer((value) => value + 1, 1);
  const [value4, increment4] = useReducer((value) => value + 1, 1);

  console.log({ value1, value2, value3, value4 });

  return (
    <>
      <div>
        {value1} {value2} {value3} {value4}
      </div>
      <button
        onClick={async () => {
          await Promise.resolve(increment1());
          await Promise.resolve(increment2());
          await Promise.resolve(increment3());
          await Promise.resolve(increment4());
        }}
      >
        Increment
      </button>
    </>
  );
}

const store = () => ({
  value: 1,
  subscription: null as (() => void) | null,
  increment() {
    this.value++;
    this.subscription?.();
  },
  subscribe(listener: () => void) {
    this.subscription = listener;
    return () => {
      this.subscription = null;
    };
  },
});

const value1Store = store();
const value2Store = store();
const value3Store = store();
const value4Store = store();

function Show3() {
  const value1 = useSyncExternalStore(
    (func) => value1Store.subscribe(func),
    () => value1Store.value
  );
  const value2 = useSyncExternalStore(
    (func) => value2Store.subscribe(func),
    () => value2Store.value
  );
  const value3 = useSyncExternalStore(
    (func) => value3Store.subscribe(func),
    () => value3Store.value
  );
  const value4 = useSyncExternalStore(
    (func) => value4Store.subscribe(func),
    () => value4Store.value
  );

  console.log({ value1, value2, value3, value4 });

  return (
    <>
      <div>
        {value1} {value2} {value3} {value4}
      </div>
      <button
        onClick={async () => {
          micro();
          await Promise.resolve(value1Store.increment());
          await Promise.resolve(value2Store.increment());
          await Promise.resolve(value3Store.increment());
          await Promise.resolve(value4Store.increment());
        }}
      >
        Increment
      </button>
    </>
  );
}
