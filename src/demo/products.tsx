import { Suspense, useEffect, useReducer, useState } from "react";
import { proxyClient } from "../query/proxy";
import { dispatch, useMutation, useQuery } from "../query/query";
import { prefix } from "../query/suspendable";
import type { CompletionClient } from "./cart";
import type { CartClient } from "./stores/cart-store";
import { products } from "./product-data";
import { registerListeners } from "../query/listeners";
import { logger } from "#logger";
import { useMutationState } from "@tanstack/react-query";

type Product = { id: string; name: string };

export function Products() {
  return (
    <div className="p-5 bg-white rounded-lg text-black basis-0 grow shrink flex flex-col gap-5">
      {products.map((product) => (
        <ProductCard key={product.id} data={product} />
      ))}
    </div>
  );
}

const { cart } = proxyClient<CartClient>();

function ProductCard({ data }: { data: Product }) {
  const [show, toggleShow] = useReducer((show) => !show, true);

  const { mutate } = useMutation(
    cart.itemAdded({ id: data.id, timestamp: Date.now() })
  );

  return (
    <>
      {/*<OnCompletePlugin id={data.id} name={data.name} />*/}
      <div>
        <div>{data.name}</div>
        <div className="flex gap-3">
          <button type="button" onClick={() => mutate()}>
            Tilføj til kurv
          </button>
          <Suspense>{show && <Quantity id={data.id} />}</Suspense>
          <button type="button" onClick={toggleShow}>
            {show ? "Skjul" : "Vis"}
          </button>
        </div>
      </div>
    </>
  );
}

function Quantity({ id }: { id: string }) {
  const { data: item } = useQuery(cart.getItem(id));
  const quantity = item?.quantity.length ?? 0;

  logger.renders(id, quantity);

  if (!quantity) {
    return null;
  }

  return <div>{item?.quantity.length} tilføjet</div>;
}

function OnCompletePlugin({ id, name }: { id: string; name: string }) {
  const { data: item } = useQuery(cart.getItem(id));

  const quantity = item?.quantity.length ?? 0;

  useEffect(() => {
    if (quantity === 0) {
      return;
    }

    const isCompleted = async () => {
      return name;
    };

    return registerListeners({
      isCompleted,
      [prefix]: "checkout/completion",
    } satisfies CompletionClient);
  }, [name, quantity]);

  return null;
}
