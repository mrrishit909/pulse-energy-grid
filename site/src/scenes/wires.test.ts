import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import LAYOUT from "../data/ieee14-layout.json";
import { hops } from "./S07Evidence";
import type { Topology } from "../model/types";

const topo = JSON.parse(readFileSync(new URL("../../public/data/grid_topology.json", import.meta.url), "utf-8")) as Topology;
const pos = (LAYOUT as unknown as { buses: Record<string, [number, number]> }).buses;

describe("The Wires (interaction 10)", () => {
  it("every bus and every branch end in grid_topology.json has a layout coordinate, and no extra ids exist", () => {
    expect(Object.keys(pos).map(Number).sort((a, b) => a - b)).toEqual(topo.buses.map((b) => b.id).sort((a, b) => a - b));
    for (const br of topo.branches) { expect(pos[String(br.from)]).toBeDefined(); expect(pos[String(br.to)]).toBeDefined(); }
  });
  it("energizes every bus by graph distance from bus 1 (whole segments, BFS)", () => {
    const h = hops(topo, 1);
    expect(h.size).toBe(14);
    expect(h.get(1)).toBe(0);
  });
  it("is labelled by the artifact's own tag plus ILLUSTRATIVE", () => {
    expect(topo.tag).toBe("SYNTHETIC");
    expect(topo.illustrative).toBe(true);
  });
});
