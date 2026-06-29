import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import { ThemeProvider } from "./providers/ThemeProvider";
import { queryClient } from "./lib/queryClient";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "rgb(var(--app-card))",
                border: "1px solid rgb(var(--app-border))",
                color: "rgb(var(--app-text))",
              },
            }}
          />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
