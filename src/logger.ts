const groups = ["renders", "events"] as const;

const current = ["renders"];

export const logger = Object.fromEntries(
  groups.map((group) => [
    group,
    (...args) => current.includes(group) && console.log(`[${group}]`, ...args),
  ])
) as {
  [Key in (typeof groups)[number]]: (...args: any[]) => void;
};
