import { prefix } from "../../query";
import type { Actions } from "../../query";

// items = items ?? JSON.parse(sessionStorage.getItem("items") ?? "[]");

type Timestamp = number;
type CartItem = { id: string; quantity: Timestamp[] };

type CartState = { items: CartItem[] };

const createCartQueries = (state: CartState) => {
  return {
    getItems() {
      return delay(() => state.items, 500);
    },
    getItem(id: string) {
      return delay(
        () => state.items.find((item) => item.id === id) ?? null,
        500
      );
    },
    [prefix]: "cart" as const,
  } satisfies Actions;
};

let i = 1;
const createCartMutations = (state: CartState) => {
  return {
    async itemAdded(item: { id: string; timestamp: Timestamp }): Promise<void> {
      if (i++ % 4 === 0) {
        return delay(
          () => Promise.reject(new Error("Failed adding item")),
          1000
        );
      }
      const index = state.items.findIndex((el) => el.id === item.id);
      if (index >= 0) {
        const copy = [...state.items];
        copy[index] = {
          ...copy[index],
          quantity: [
            ...copy[index].quantity,
            item.timestamp,
            item.timestamp + 1,
          ],
        };
        state.items = copy;
      } else {
        state.items = [...state.items, { ...item, quantity: [item.timestamp] }];
      }
      return delay(() => {}, 500);
    },
    async itemRemoved(item: { id: string; timestamp: Timestamp }) {
      if (i++ % 4 === 0) {
        return delay(() => Promise.reject<void>("Failed getting item"), 500);
      }
      const index = state.items.findIndex((el) => el.id === item.id);
      if (index >= 0) {
        const copy = [...state.items];
        copy[index] = {
          ...copy[index],
          quantity: copy[index].quantity.filter((el) => el !== item.timestamp),
        };
        state.items = copy;
      }
      return delay(() => {}, 500);
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

/**
 * helpers
 */
const delay = <T>(value: () => T, ms = 500): Promise<T> => {
  return new Promise((res) => setTimeout(() => res(value()), ms));
};
