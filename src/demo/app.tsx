import { Suspense } from "react";
import { Products } from "./products";
import { Cart } from "./cart";
import * as base from "./stores/cart-store";
import * as api from "./stores/cart-store-api";
import * as optimistic from "./stores/cart-store-optimistic";
import { registerListeners } from "../query/listeners";

// listen to events
/*
setTimeout(() => {
  registerListeners(base.createCartClient(base.createCartState()));
}, 500);
*/

registerListeners(
  optimistic.createCartClient(
    optimistic.createCartState(),
    api.createCartClient(api.createCartState())
  )
);

export function App() {
  return (
    <div className="w-full h-full flex p-5 gap-5">
      <Suspense fallback="Loading...">
        <Products />
        <Cart />
      </Suspense>
    </div>
  );
}
