import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./product-media.css";

const root = document.getElementById("brand-root")!;
const view = <App page={root.dataset.page === "cards" ? "cards" : "home"} />;
if (root.hasChildNodes()) {
  hydrateRoot(root, view);
} else {
  createRoot(root).render(view);
}
