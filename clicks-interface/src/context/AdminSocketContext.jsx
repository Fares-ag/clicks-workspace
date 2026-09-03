import { createContext, useContext } from "react";

export const AdminSocketContext = createContext(null);

/** Shared admin socket from AdminLayout — do not disconnect on unmount. */
export function useAdminSocket() {
  return useContext(AdminSocketContext);
}
