import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CartItem } from 'entities/Commerce/model/types';

interface CartState {
  items: CartItem[];
}

interface CartActions {
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  totalCents: () => number;
  hasItem: (id: string) => boolean;
}

interface CartStore extends CartState, CartActions { }

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      add: (item) => {
        set((state) => {
          const alreadyInCart = state.items.some((i) => i.id === item.id);
          if (alreadyInCart) return state;
          return { items: [...state.items, item] };
        });
      },

      remove: (id) => {
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
      },

      clear: () => set({ items: [] }),

      totalCents: () => get().items.reduce((sum, item) => sum + item.priceCents, 0),

      hasItem: (id) => get().items.some((i) => i.id === id),
    }),
    {
      name: 'swelldays-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
