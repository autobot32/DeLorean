import { useMemo } from 'react';
import type { TunnelConfig, TunnelSlot } from './tunnelConfig';

export type MemoryAsset = {
  id: string;
  url: string;
  story?: { text?: string; audioUrl?: string | null };
};

type SlotBinding = TunnelSlot & { asset?: MemoryAsset };

export function useTunnelSlots(config: TunnelConfig, assets: MemoryAsset[]): SlotBinding[] {
  return useMemo(() => {
    if (!assets?.length) {
      return config.slots;
    }

    return config.slots.map((slot, index) => ({
      ...slot,
      asset: assets[index],
    }));
  }, [config.slots, assets]);
}
