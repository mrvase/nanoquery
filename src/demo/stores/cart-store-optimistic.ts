import { ProxyClient, proxy } from "../../query/proxy";
import { invalidate, query, mutate } from "../../query/query";
import {
  EventContainer,
  InferEvent,
  prefix,
  local,
} from "../../query/suspendable";
import { Actions } from "../../query/types";
import { CartClient, CartMutations, CartQueries } from "./cart-store-api";
import { logger } from "#logger";

type CartEvent = InferEvent<CartMutations, "cartBase">;

type OptimisticCartState = {
  events: CartEvent[];
  track: <T>(event: EventContainer<T>) => EventContainer<T>;
};

const createCartQueries = (
  state: OptimisticCartState,
  client: ProxyClient<CartQueries, "cartBase">
) => {
  return {
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

            const index = items.findIndex((el) => el.id === input.id);

            if (index >= 0) {
              const copy = [...items];
              copy[index] = {
                ...copy[index],
                quantity: [
                  ...copy[index].quantity.filter(
                    (el) => el !== input.timestamp
                  ),
                  input.timestamp,
                ],
              };
              return copy;
            }

            return [...items, { ...input, quantity: [input.timestamp] }];
          }
          case "cartBase/itemRemoved": {
            const input = event.payload[0];

            const index = items.findIndex((el) => el.id === input.id);

            if (index >= 0) {
              const copy = [...items];
              copy[index] = {
                ...copy[index],
                quantity: copy[index].quantity.filter(
                  (el) => el !== input.timestamp
                ),
              };
              return copy;
            }

            return items;
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

              if (input.id === id) {
                return {
                  id: input.id,
                  quantity: [
                    ...(item?.quantity ?? []).filter(
                      (el) => el !== input.timestamp
                    ),
                    input.timestamp,
                  ],
                };
              }

              return item;
            case "cartBase/itemRemoved": {
              const input = event.payload[0];

              if (input.id === id) {
                return {
                  id: input.id,
                  quantity: [
                    ...(item?.quantity ?? []).filter(
                      (el) => el !== input.timestamp
                    ),
                  ],
                };
              }

              return item;
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
    [prefix]: "cart",
  } satisfies Actions<CartQueries>;
};

const createCartMutations = (
  state: OptimisticCartState,
  client: ProxyClient<CartMutations, "cartBase">
) => {
  return {
    itemAdded(item: { id: string; timestamp: number }) {
      logger.events("ITEM ADDED");
      const promise = client.cartBase.itemAdded(item);
      return mutate(state.track(promise));
    },
    itemRemoved(item: { id: string; timestamp: number }) {
      const promise = client.cartBase.itemRemoved(item);
      return mutate(state.track(promise));
    },
    [prefix]: "cart",
  } satisfies Actions<CartMutations>;
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
  client: CartClient
) => {
  return {
    ...createCartQueries(state, proxy(client, "cartBase")),
    ...createCartMutations(state, proxy(client, "cartBase")),
    [local]: true,
  };
};
