import { prefix, local } from "./suspendable";

export type ActionRecord<TPrefix extends string = string> = {
  [key: string]: (...args: any[]) => any;
  [prefix]: TPrefix;
  [local]?: boolean;
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
  [local]?: boolean;
};
