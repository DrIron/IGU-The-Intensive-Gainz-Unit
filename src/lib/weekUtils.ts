import { startOfWeek, endOfWeek } from 'date-fns';

/** Mon-Sun week boundaries — the canonical IGU adherence week. */
export const startOfIguWeek = (d: Date = new Date()) => startOfWeek(d, { weekStartsOn: 1 });
export const endOfIguWeek = (d: Date = new Date()) => endOfWeek(d, { weekStartsOn: 1 });
