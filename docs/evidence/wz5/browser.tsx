import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { FooterCounter, FooterCounterArtwork } from "../../../wizbar/src/FooterCounter";
import { positiveSource } from "./fixtures";

function Fixture() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const state = new URLSearchParams(location.search).get("state") ?? "positive";
  return <main data-ready={ready}>
    <h1>WizBar · synthetic presentation</h1>
    <p>{state === "blank" ? "Production fallback: complete inputs and subagent mapping are unverified. No counter or button is rendered." : "Explicit synthetic inputs. This is a browser rendering of the candidate artwork, not Cloudroom footer capability or live-count proof."}</p>
    <div className="fixture">
      <div className="context">{state === "blank" ? "Unverified input" : state === "zero" ? "0 threads + 0 subagents" : "2 threads + 3 subagents"}</div>
      <footer>{state === "blank" ? <FooterCounter /> : <FooterCounterArtwork source={state === "zero" ? { complete: true, threads: [], subagentsByThread: new Map() } : positiveSource} />}</footer>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
