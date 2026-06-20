import { create } from "zustand";

interface ToastState {
  message: string;
  open: boolean;
  show: (message: string) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  message: "",
  open: false,
  show: (message) => {
    set({ message, open: true });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => set({ open: false }), 2000);
  },
}));
