import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: { label:string; onClick:()=>void };
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: ToastType, action?:Toast['action']) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, type = 'success', action) => {
    const id = Math.random().toString(36).slice(2);
    set(s => ({ toasts: [...s.toasts, { id, message, type, action }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), action ? 12000 : 4000);
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
