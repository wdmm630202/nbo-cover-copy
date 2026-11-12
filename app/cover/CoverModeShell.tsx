"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { bindMakeoverFrame, notifyMakeoverFrame, resolveCreationMode, creationModeURL } from "../../public/makeover-host.mjs";

type CreationMode = "cover" | "makeover";
const modes: CreationMode[] = ["cover", "makeover"];

export default function CoverModeShell({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<CreationMode>("cover");
  const [visited, setVisited] = useState(false);
  const [height, setHeight] = useState(1200);
  const frame = useRef<HTMLIFrameElement>(null);

  function showMode(next: CreationMode, updateURL = true) {
    setMode(next);
    if (next === "makeover") setVisited(true);
    if (updateURL) history.replaceState(history.state, "", creationModeURL(location.href, next));
  }

  useEffect(() => {
    const restore = () => {
      const next = resolveCreationMode(location.search);
      setMode(next);
      if (next === "makeover") setVisited(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    document.body.classList.add("creation-modes-ready");
    return () => {
      window.removeEventListener("popstate", restore);
      document.body.classList.remove("creation-modes-ready", "creation-makeover-active");
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("creation-makeover-active", mode === "makeover");
    if (mode === "makeover" && frame.current) {
      const id = requestAnimationFrame(() => { if (frame.current) notifyMakeoverFrame(frame.current); });
      return () => cancelAnimationFrame(id);
    }
    if (mode === "cover" && visited) {
      const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      return () => cancelAnimationFrame(id);
    }
  }, [mode, visited]);

  useEffect(() => {
    if (!visited || !frame.current) return;
    return bindMakeoverFrame(frame.current, setHeight);
  }, [visited]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, current: CreationMode) {
    let index = modes.indexOf(current);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") index = (index + 1) % modes.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") index = (index + modes.length - 1) % modes.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = modes.length - 1;
    else return;
    event.preventDefault();
    showMode(modes[index]);
    document.getElementById(`creation-tab-${modes[index]}`)?.focus();
  }

  return <>
    <div className="creation-mode-bar" role="tablist" aria-label="选择制作模式">
      {modes.map(value => <button key={value} type="button" id={`creation-tab-${value}`} role="tab" aria-selected={mode === value} aria-controls={value === "cover" ? "coverPanel" : "makeoverPanel"} tabIndex={mode === value ? 0 : -1} onClick={() => showMode(value)} onKeyDown={event => navigate(event, value)}>{value === "cover" ? "封面制作" : "素人改造"}</button>)}
    </div>
    <section id="coverPanel" role="tabpanel" aria-labelledby="creation-tab-cover" hidden={mode !== "cover"}>{children}</section>
    <section id="makeoverPanel" className="creation-makeover-panel" role="tabpanel" aria-labelledby="creation-tab-makeover" hidden={mode !== "makeover"}>
      {visited && <iframe ref={frame} id="makeoverFrame" className="creation-makeover-frame" title="素人改造对比图编辑器" src="/makeover/index.html?embed=1&v=20261112-top-align" style={{ height }} />}
    </section>
  </>;
}
