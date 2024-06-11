import { produce } from "immer";

export type Timestamp = number;
export type CartItem = { id: string; quantity: Timestamp[] };

export type Cart = { items: CartItem[] };

/*
const method = (func: (base, ...args) => any) => {
  return (base: any) => (...args) => produce(base, ...args)
}

class Cart2 {
  items: CartItem[] = [];

  addItem = method((base, item: CartItem) => {
    const index = base.items.findIndex((el) => el.id === item.id);
    if (index >= 0) {
      base.items[index] = increaseQuantity(base.items[index], ...item.quantity);
    } else {
      base.items.push(item);
    }
  })(this)
}
*/

export const createCart = (): Cart => {
  return { items: [] };
};

export const increaseQuantity = (
  item: CartItem,
  ...timestamp: Timestamp[]
): CartItem => {
  return {
    id: item.id,
    quantity: [
      ...(item?.quantity ?? []).filter((el) => !timestamp.includes(el)),
      ...timestamp,
    ],
  };
};

export const decreaseQuantity = (
  item: CartItem,
  ...timestamp: Timestamp[]
): CartItem => {
  return {
    id: item.id,
    quantity: [
      ...(item?.quantity ?? []).filter((el) => !timestamp.includes(el)),
      ...timestamp,
    ],
  };
};

export const addItem = produce((items: Cart["items"], item: CartItem) => {
  const index = items.findIndex((el) => el.id === item.id);
  if (index >= 0) {
    items[index] = increaseQuantity(items[index], ...item.quantity);
  } else {
    items.push(item);
  }
});

export const removeItem = produce((items: Cart["items"], item: CartItem) => {
  const index = items.findIndex((el) => el.id === item.id);
  if (index >= 0) {
    items[index] = decreaseQuantity(items[index], ...item.quantity);
    if (items[index].quantity.length === 0) {
      items.splice(index, 1);
    }
  }
});
