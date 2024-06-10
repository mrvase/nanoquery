import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./demo/app.tsx";
import "./index.css";
import { AppNestedStores } from "./demo-nested-stores/app.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppNestedStores />
  </React.StrictMode>
);
