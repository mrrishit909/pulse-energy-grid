/** The Hour Inspector (interaction 9): one open hour per scene at a time. */
import { store } from "./store";
export const inspector = store({ scene: null as string | null, hour: null as number | null });
export const openHour = (scene: string, hour: number) => inspector.set({ scene, hour });
export const closeHour = () => inspector.set({ scene: null, hour: null });
