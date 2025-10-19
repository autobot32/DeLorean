export type TunnelSlot = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type TunnelConfig = {
  length: number;
  radius: number;
  slots: TunnelSlot[];
};

/**
 * Static tunnel blueprint. Gemini (or any other service) should only swap
 * textures/audio for the slots listed here—geometry stays constant.
 */
export const DefaultTunnel: TunnelConfig = {
  length: 120,
  radius: 6,
  slots: [
    { id: 'slot-01', position: [0, 0, -8], rotation: [0, Math.PI / 2, 0], scale: [4, 3, 1] },
    { id: 'slot-02', position: [0, 1, -16], rotation: [0, -Math.PI / 2, 0], scale: [4, 3, 1] },
    { id: 'slot-03', position: [0, -0.5, -24], rotation: [0, Math.PI / 3, 0], scale: [4, 3, 1] },
    { id: 'slot-04', position: [0, 0, -32], rotation: [0, -Math.PI / 3, 0], scale: [4, 3, 1] },
    { id: 'slot-05', position: [0, 0.75, -40], rotation: [0, Math.PI / 1.5, 0], scale: [4, 3, 1] },
    { id: 'slot-06', position: [0, -1, -48], rotation: [0, -Math.PI / 2.2, 0], scale: [4, 3, 1] },
    { id: 'slot-07', position: [0, 0.25, -56], rotation: [0, Math.PI / 2.8, 0], scale: [4, 3, 1] },
    { id: 'slot-08', position: [0, 0, -64], rotation: [0, -Math.PI / 1.7, 0], scale: [4, 3, 1] },
    { id: 'slot-09', position: [0, -0.75, -72], rotation: [0, Math.PI / 2.5, 0], scale: [4, 3, 1] },
    { id: 'slot-10', position: [0, 0.5, -80], rotation: [0, -Math.PI / 2.5, 0], scale: [4, 3, 1] },
  ],
};

/**
 * Utility to generate additional evenly spaced slots if more images arrive.
 * Keeps geometry consistent without altering the default config.
 */
export function extendSlots(base: TunnelConfig, count: number): TunnelSlot[] {
  if (count <= base.slots.length) {
    return base.slots.slice(0, count);
  }

  const extra: TunnelSlot[] = [];
  const spacing = Math.abs(base.slots.at(-1)?.position[2] ?? -8) + 8;

  for (let i = base.slots.length; i < count; i += 1) {
    const z = -spacing - 8 * (i - base.slots.length);
    extra.push({
      id: `slot-${(i + 1).toString().padStart(2, '0')}`,
      position: [0, 0, z],
      rotation: [0, (i % 2 === 0 ? 1 : -1) * Math.PI / 2.8, 0],
      scale: [4, 3, 1],
    });
  }

  return [...base.slots, ...extra];
}
