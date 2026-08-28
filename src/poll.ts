export const ACTIVE_INTERVAL = 5_000;
export const IDLE_INTERVAL = 30_000;

export const nextInterval = (active: boolean) => (active ? ACTIVE_INTERVAL : IDLE_INTERVAL);
