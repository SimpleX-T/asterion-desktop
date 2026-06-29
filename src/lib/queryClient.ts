import { QueryClient } from "@tanstack/react-query";

// Desktop app: data is read-mostly and the webview never loses focus the way a
// browser tab does, so we don't refetch on focus. Cached pages survive
// navigation (gcTime) so going back to a list is instant, no refetch flash.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000, // catalog/metadata rarely changes
      gcTime: 30 * 60_000, // keep cached results 30 min after a screen unmounts
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
