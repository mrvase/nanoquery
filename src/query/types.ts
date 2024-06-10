import { prefix } from "./suspendable";

export type ActionRecord = {
  [key: string]: (...args: any[]) => any;
  [prefix]: string;
};

export type Actions<
  T extends ActionRecord = ActionRecord,
  Prefix extends string | undefined = T[typeof prefix]
> = {
  [K in Extract<keyof T, string>]: (
    ...input: Parameters<T[K]>
  ) => Awaited<ReturnType<T[K]>> | Promise<Awaited<ReturnType<T[K]>>>;
} & {
  [prefix]: Prefix;
};
