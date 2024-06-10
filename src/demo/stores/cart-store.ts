import { prefix } from "../../query/suspendable";
import { Actions } from "../../query/types";

// items = items ?? JSON.parse(sessionStorage.getItem("items") ?? "[]");

type Timestamp = number;
type CartItem = { id: string; quantity: Timestamp[] };

type CartState = { items: CartItem[] };

const createCartQueries = (state: CartState) => {
  return {
    getItems() {
      return state.items;
    },
    getItem(id: string) {
      return state.items.find((item) => item.id === id) ?? null;
    },
    [prefix]: "cart" as const,
  } satisfies Actions;
};

const createCartMutations = (state: CartState) => {
  return {
    itemAdded(item: { id: string; timestamp: Timestamp }) {
      const index = state.items.findIndex((el) => el.id === item.id);
      if (index >= 0) {
        const copy = [...state.items];
        copy[index] = {
          ...copy[index],
          quantity: [...copy[index].quantity, item.timestamp],
        };
        state.items = copy;
      } else {
        state.items = [...state.items, { ...item, quantity: [item.timestamp] }];
      }
    },
    itemRemoved(item: { id: string; timestamp: Timestamp }) {
      const index = state.items.findIndex((el) => el.id === item.id);
      if (index >= 0) {
        const copy = [...state.items];
        copy[index] = {
          ...copy[index],
          quantity: copy[index].quantity.filter((el) => el !== item.timestamp),
        };
        state.items = copy;
      }
    },
    [prefix]: "cart" as const,
  } satisfies Actions;
};

export const createCartState = (): CartState => ({
  items: [],
});

// create procedures from state
export const createCartClient = (state: CartState) => ({
  ...createCartQueries(state),
  ...createCartMutations(state),
});

// infer types
export type CartQueries = ReturnType<typeof createCartQueries>;
export type CartMutations = ReturnType<typeof createCartMutations>;
export type CartClient = ReturnType<typeof createCartClient>;
