import { createRoot } from "react-dom/client";
import { WorkshopToolView } from "./plugin.js";

createRoot(document.getElementById("root")!).render(
  <WorkshopToolView requestWorkspaceRoot={() => undefined} />,
);
