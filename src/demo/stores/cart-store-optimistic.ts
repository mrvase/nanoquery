import { type ProxyClient, proxy } from "../../query";
import { invalidate, query, mutate } from "../../query";
import { type InferEvent, topic, local } from "../../query";
import type { Actions, EventContainer } from "../../query";
import type { CartEvents, CartQueries } from "./cart-store-api";
import { logger } from "#logger";
import * as cart from "./cart";

type CartEvent = InferEvent<CartEvents, "cartBase">;

type OptimisticCartState = {
  events: CartEvent[];
  track: <T>(event: EventContainer<T>) => EventContainer<T>;
};

const createCartQueries = (
  state: OptimisticCartState,
  client: ProxyClient<CartQueries, "cartBase">
) => {
  return {
    [topic]: "cart",
    getItems() {
      const event = client.cartBase.getItems();
      const items = query(event);

      if (items instanceof Promise) {
        return items;
      }

      return state.events.reduce((items, event) => {
        switch (event.type) {
          case "cartBase/itemAdded": {
            const input = event.payload[0];

            return cart.addItem(items, {
              id: input.id,
              quantity: [input.timestamp],
            });
          }
          case "cartBase/itemRemoved": {
            const input = event.payload[0];

            return cart.removeItem(items, {
              id: input.id,
              quantity: [input.timestamp],
            });
          }
          default: {
            return items;
          }
        }
      }, items);
    },
    getItem(id: string) {
      const item = query(client.cartBase.getItem(id));

      const optimistic = state.events.reduce(
        (item, event) => {
          switch (event.type) {
            case "cartBase/itemAdded":
              const input = event.payload[0];

              if (input.id !== id) {
                return item;
              }

              return cart.increaseQuantity(
                item ?? { id: id, quantity: [] },
                input.timestamp
              );
            case "cartBase/itemRemoved": {
              const input = event.payload[0];

              if (input.id !== id || !item) {
                return item;
              }

              const result = cart.decreaseQuantity(item, input.timestamp);

              if (result.quantity.length === 0) {
                return null;
              }

              return result;
            }
            default: {
              return item;
            }
          }
        },
        item instanceof Promise ? null : item
      );

      return optimistic ?? item;
    },
  } satisfies Actions<CartQueries>;
};

const createCartEvents = (
  state: OptimisticCartState,
  client: ProxyClient<CartEvents, "cartBase">
) => {
  return {
    [topic]: "cart",
    itemAdded(item: { id: string; timestamp: number }) {
      const promise = client.cartBase.itemAdded(item);
      return mutate(state.track(promise));
    },
    itemRemoved(item: { id: string; timestamp: number }) {
      const promise = client.cartBase.itemRemoved(item);
      return mutate(state.track(promise));
    },
  } satisfies Actions<CartEvents>;
};

export const createCartState = (): OptimisticCartState => ({
  events: [],
  track<T>(promise: EventContainer<T>) {
    const event = promise.event as unknown as CartEvent;
    return promise
      .onMutate(() => {
        this.events.push(event);
        invalidate();
      })
      .onError(() => {
        this.events.splice(this.events.indexOf(event), 1);
        invalidate();
      });
  },
});

// create client
export const createCartClient = (
  state: OptimisticCartState,
  client: CartQueries & CartEvents
) => {
  return {
    [local]: true,
    ...createCartQueries(state, proxy(client, "cartBase")),
    ...createCartEvents(state, proxy(client, "cartBase")),
  };
};
