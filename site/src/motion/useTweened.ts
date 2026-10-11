import { useEffect, useState } from "react";
import { Tween } from "./tween";
import { easeSmooth } from "./ease";
import { addFrame } from "./loop";

/**
 * A number that follows `target` with a retargetable 600ms --ease-smooth tween
 * (MOTION_SYSTEM 5.8 / 5.11). Re-renders only while moving; reduced motion = instant.
 */
export function useTweened(target: number, duration = 600) {
  const [tw] = useState(() => new Tween(target, duration, easeSmooth));
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (tw.target === target) return;
    tw.retarget(target, performance.now(), duration);
    const off = addFrame((now) => {
      const moving = tw.update(now);
      setValue(tw.value);
      if (!moving) off();
    });
    return off;
  }, [tw, target, duration]);
  return value;
}
