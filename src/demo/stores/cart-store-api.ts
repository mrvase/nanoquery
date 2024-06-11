import { topic } from "../../query";
import type { Actions } from "../../query";
import * as cart from "./cart";
import type { Cart } from "./cart";

// items = items ?? JSON.parse(sessionStorage.getItem("items") ?? "[]");

type Timestamp = number;

const createCartQueries = (state: Cart) => {
  return {
    [topic]: "cart" as const,
    getItems() {
      return delay(() => state.items, 500);
    },
    getItem(id: string) {
      return delay(
        () => state.items.find((item) => item.id === id) ?? null,
        500
      );
    },
  } satisfies Actions;
};

let i = 1;
const createCartEvents = (state: Cart) => {
  return {
    [topic]: "cart" as const,
    async itemAdded(item: { id: string; timestamp: Timestamp }): Promise<void> {
      if (i++ % 4 === 0) {
        return delay(
          () => Promise.reject(new Error("Failed adding item")),
          1000
        );
      }
      state.items = cart.addItem(state.items, {
        id: item.id,
        quantity: [item.timestamp, item.timestamp + 1],
      });
      console.log("item added", state);
      return delay(() => {}, 500);
    },
    async itemRemoved(item: { id: string; timestamp: Timestamp }) {
      if (i++ % 4 === 0) {
        return delay(() => Promise.reject<void>("Failed getting item"), 500);
      }
      state.items = cart.removeItem(state.items, {
        id: item.id,
        quantity: [item.timestamp],
      });
      return delay(() => {}, 500);
    },
  } satisfies Actions;
};

// create procedures from state
export const createCartClient = (state: Cart) => ({
  ...createCartQueries(state),
  ...createCartEvents(state),
});

// infer types
export type CartQueries = ReturnType<typeof createCartQueries>;
export type CartEvents = ReturnType<typeof createCartEvents>;

/**
 * helpers
 */
const delay = <T>(value: () => T, ms = 500): Promise<T> => {
  return new Promise((res) => setTimeout(() => res(value()), ms));
};
