export type ResolvablePromise<T> = Promise<T> & {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

export const createResolvablePromise = <T>() => {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  const promise: ResolvablePromise<T> = Object.assign(
    new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    { resolve: resolve!, reject: reject! }
  );
  return promise;
};
