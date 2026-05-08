import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  drawerOpen: boolean;
  toggleSidebar: () => void;
  setDrawerOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  drawerOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
}));
