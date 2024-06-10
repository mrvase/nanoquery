import { proxyClient } from "../query/proxy";
import { dispatch, requestAll, useQuery } from "../query/query";
import { prefix } from "../query/suspendable";
import type { CartClient } from "./stores/cart-store";
import { products } from "./product-data";
import { Suspense } from "react";

export type CompletionClient = {
  isCompleted(): Promise<string>;
  [prefix]: "checkout/completion";
};

const {
  cart,
  checkout: { completion },
} = proxyClient<CartClient | CompletionClient>();

export function Cart() {
  return (
    <Suspense
      fallback={<div className="p-5 basis-0 grow shrink">Loading...</div>}
    >
      <CartView />
    </Suspense>
  );
}

export function CartView() {
  const { data: items } = useQuery(cart.getItems());

  return (
    <div className="p-5 bg-white rounded-lg text-black  basis-0 grow shrink flex flex-col gap-5">
      {items.map((item) => (
        <div key={item.id}>
          <div>
            {item.quantity.length} stk.{" "}
            {products.find((el) => el.id === item.id)?.name ?? "Intet navn"}
          </div>
          <button
            type="button"
            onClick={() =>
              dispatch(
                cart.itemRemoved({
                  id: item.id,
                  timestamp: item.quantity.slice(-1)[0],
                })
              )
            }
          >
            Fjern
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={async () =>
          console.log(await requestAll(completion.isCompleted()))
        }
      >
        Complete
      </button>
    </div>
  );
}
