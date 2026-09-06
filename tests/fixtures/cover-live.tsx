import React from "react";
import { createRoot } from "react-dom/client";
import CoverStudio from "../../app/cover/CoverStudio";
const root = createRoot(document.getElementById("root")!);
root.render(<CoverStudio />);
Object.assign(window, { unmountLiveFixture: () => root.unmount() });
