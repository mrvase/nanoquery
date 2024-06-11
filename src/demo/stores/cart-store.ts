import { topic, local } from "../../query";
import type { Cart, Timestamp } from "./cart";
import * as cart from "./cart";

// items = items ?? JSON.parse(sessionStorage.getItem("items") ?? "[]");

const createCartQueries = (state: Cart) => {
  return {
    [topic]: "cart" as const,
    getItems() {
      return state.items;
    },
    getItem(id: string) {
      return state.items.find((item) => item.id === id) ?? null;
    },
  };
};

const createCartEvents = (state: Cart) => {
  return {
    [topic]: "cart" as const,
    itemAdded(item: { id: string; timestamp: Timestamp }) {
      state.items = cart.addItem(state.items, {
        id: item.id,
        quantity: [item.timestamp, item.timestamp + 1],
      });
    },
    itemRemoved(item: { id: string; timestamp: Timestamp }) {
      state.items = cart.removeItem(state.items, {
        id: item.id,
        quantity: [item.timestamp],
      });
    },
  };
};

export const createCartState = (): Cart => ({
  items: [],
});

// create procedures from state
export const createCartClient = (state: Cart) => ({
  [local]: true,
  ...createCartQueries(state),
  ...createCartEvents(state),
});

// infer types
export type CartQueries = ReturnType<typeof createCartQueries>;
export type CartEvents = ReturnType<typeof createCartEvents>;
