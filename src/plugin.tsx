import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { isSlateMarkdownPath, parseMarkdownSections, parseMarkdownTable, parseScopedMarkdownTable, parseSlateConfig, splitTabbedDocument, type SlateConfig, type SlateSourceDefinition } from "./index.js";
import { clearSlateFavoriteSourceIds, describeSlateView, isSlateTauriRuntime, keepLatestSnapshot, loadSlateFavoriteSourceIds, openSlateExternalUrl, parseInlineMarkdown, partitionSlateSources, releaseIfDisposed, retainSelectedSource, saveSlateFavoriteSourceIds, shouldRefreshSource, slateDemoSnapshots, slateDemoSources, slateHeadingTag, slateLinkTarget, sortTableRows, toggleSlateFavoriteSourceId, validateSourceMetadata, type SlateSnapshot, type SlateSourceChange, type TableSortDirection } from "./pluginModel.js";
import { slateHostThemeVariables as hostTheme, slateOwnedSemanticColors } from "./themeContract.js";

type Source = Pick<SlateSourceDefinition, "id" | "label" | "view">;
const configFile = "slate.config.json";
const SlatePortalContext = createContext<HTMLElement | null>(null);
function createSlateDemoConfigSources(): SlateSourceDefinition[] {
  return slateDemoSources.map((source) => ({ ...source, path: `/preview/${source.id}.md` }));
}
export type WorkspaceRootRequestResult = { ok: true } | { ok: false; message: string };
export type WorkspaceRootBrowseResult = { ok: true; root: string } | { ok: false; canceled?: boolean; message?: string };
export type BrowseWorkspaceRoot = () => WorkspaceRootBrowseResult | void | Promise<WorkspaceRootBrowseResult | void>;
export type MarkdownFileBrowseResult = { ok: true; path: string } | { ok: false; canceled?: boolean; message?: string };
export type BrowseMarkdownFile = (currentPath?: string) => MarkdownFileBrowseResult | void | Promise<MarkdownFileBrowseResult | void>;
export type WorkshopToolViewProps = { activeRouteId?: string; workspaceRoot?: string; requestWorkspaceRoot: (root?: string) => WorkspaceRootRequestResult | void; browseWorkspaceRoot?: BrowseWorkspaceRoot; browseMarkdownFile?: BrowseMarkdownFile; clearWorkspaceRoot?: () => void };
type WorkspaceNotice = { state: "loading" | "success"; text: string };
type WorkspacePhase = "loading" | "loaded" | "error";

export function WorkshopToolView({ workspaceRoot, requestWorkspaceRoot, browseWorkspaceRoot, browseMarkdownFile, clearWorkspaceRoot }: WorkshopToolViewProps) {
  const [root, setRoot] = useState(""); const [sources, setSources] = useState<Source[]>([]); const [selected, setSelected] = useState<string>();
  const [data, setData] = useState<Record<string, SlateSnapshot>>({}); const [error, setError] = useState<string>(); const [workspaceNotice, setWorkspaceNotice] = useState<WorkspaceNotice>(); const [managing, setManaging] = useState(false); const [reload, setReload] = useState(0); const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadSlateFavoriteSourceIds(slateLocalStorage(), workspaceRoot ?? "")); const [loadedWorkspaceRoot, setLoadedWorkspaceRoot] = useState<string>(); const [failedWorkspaceRoot, setFailedWorkspaceRoot] = useState<string>(); const versions = useRef<Record<string, number>>({}); const previousWorkspaceRoot = useRef(workspaceRoot); const pendingWorkspaceConfirmation = useRef(false);
  useEffect(() => { setFavoriteIds(loadSlateFavoriteSourceIds(slateLocalStorage(), workspaceRoot ?? "")); }, [workspaceRoot]);
  useEffect(() => {
    const previous = previousWorkspaceRoot.current;
    if (workspaceRoot !== previous) {
      setSources([]); setSelected(undefined); setData({}); setManaging(false); setLoadedWorkspaceRoot(undefined); setFailedWorkspaceRoot(undefined); versions.current = {};
    }
    if (workspaceRoot && workspaceRoot !== previous) {
      pendingWorkspaceConfirmation.current = true;
      setWorkspaceNotice({ state: "loading", text: previous ? "Slate folder changed. Loading configured documents…" : "Folder selected. Loading configured documents…" });
    } else if (!workspaceRoot) {
      pendingWorkspaceConfirmation.current = false;
      setWorkspaceNotice(undefined);
    }
    previousWorkspaceRoot.current = workspaceRoot;
  }, [workspaceRoot]);
  const read = useCallback(async (id: string, active: () => boolean = () => true) => { if (!workspaceRoot) return; const version = (versions.current[id] ?? 0) + 1; versions.current[id] = version; try { const result = await invoke<SlateSnapshot>("read_configured_markdown_source", { workspaceRoot, configFile, source: id }); if (!active()) return; setData((old) => keepLatestSnapshot(old, id, version, versions.current[id], result)); if (versions.current[id] === version) setError(undefined); } catch { if (active() && versions.current[id] === version) setError("Slate couldn't refresh this document. It will keep the last good view when one is available."); } }, [workspaceRoot]);
  useEffect(() => { if (!workspaceRoot) return; let disposed = false; let stop: (() => void) | undefined; const active = () => !disposed; setError(undefined); setFailedWorkspaceRoot(undefined); void (async () => { try { const raw = await invoke<unknown>("read_configured_markdown_sources", { workspaceRoot, configFile }); if (!active()) return; const listed = validateSourceMetadata(raw); if (!listed) throw new Error("Slate configuration contains unsupported source metadata."); setSources(listed); setSelected((old) => retainSelectedSource(old, listed)); setLoadedWorkspaceRoot(workspaceRoot); await Promise.all(listed.map((source) => read(source.id, active))); if (!active()) return; const lateStop = await listen<SlateSourceChange>("local-markdown://source-changed", (event) => { if (shouldRefreshSource(workspaceRoot, event.payload, configFile)) void read(event.payload.source, active); }); if (releaseIfDisposed(disposed, lateStop)) return; stop = lateStop; await invoke("start_configured_markdown_watch", { workspaceRoot, configFile }); if (active() && pendingWorkspaceConfirmation.current) { pendingWorkspaceConfirmation.current = false; setWorkspaceNotice({ state: "success", text: "Slate folder connected." }); } } catch { if (active()) { setSources([]); setSelected(undefined); setData({}); setLoadedWorkspaceRoot(undefined); setFailedWorkspaceRoot(workspaceRoot); pendingWorkspaceConfirmation.current = false; setWorkspaceNotice(undefined); setError("Slate couldn't open this folder. Check that it still exists, Workshop has access to it, and it contains a valid slate.config.json. Then use Change Slate folder to try again."); } } })(); return () => { disposed = true; stop?.(); }; }, [workspaceRoot, read, reload]);
  if (!workspaceRoot && isBrowserPreview() && !isSetupPreview()) return <DemoSlate browseMarkdownFile={browseMarkdownFile} />;
  if (!workspaceRoot) return <SlateRoot><SlateWorkspaceSetup initialRoot={root} onRootChange={setRoot} requestWorkspaceRoot={requestWorkspaceRoot} browseWorkspaceRoot={browseWorkspaceRoot} /></SlateRoot>;
  const workspacePhase: WorkspacePhase = failedWorkspaceRoot === workspaceRoot ? "error" : loadedWorkspaceRoot === workspaceRoot ? "loaded" : "loading";
  const visibleSources = workspacePhase === "loaded" ? sources : [];
  const visibleData = workspacePhase === "loaded" ? data : {};
  const source = visibleSources.find((item) => item.id === selected); return <SlateRoot>{managing && workspacePhase === "loaded" ? <ManageDocuments workspaceRoot={workspaceRoot} browseMarkdownFile={browseMarkdownFile} onDone={() => { setManaging(false); setSources([]); setSelected(undefined); setLoadedWorkspaceRoot(undefined); setFailedWorkspaceRoot(undefined); setReload((value) => value + 1); }} /> : source ? <SourceDocument source={source} snapshot={visibleData[source.id]} onBack={() => setSelected(undefined)} /> : <SourcePicker sources={visibleSources} phase={workspacePhase} favoriteIds={favoriteIds} onSelect={setSelected} onManage={() => setManaging(true)} onToggleFavorite={(id) => setFavoriteIds((current) => { const next = toggleSlateFavoriteSourceId(current, id); saveSlateFavoriteSourceIds(slateLocalStorage(), workspaceRoot, next); return next; })} workspaceRoot={workspaceRoot} requestWorkspaceRoot={requestWorkspaceRoot} browseWorkspaceRoot={browseWorkspaceRoot} clearWorkspaceRoot={clearWorkspaceRoot} notice={workspaceNotice} onDismissNotice={() => setWorkspaceNotice(undefined)} onRefreshWorkspace={() => { setSources([]); setSelected(undefined); setData({}); setLoadedWorkspaceRoot(undefined); setFailedWorkspaceRoot(undefined); versions.current = {}; pendingWorkspaceConfirmation.current = true; setWorkspaceNotice({ state: "loading", text: "Refreshing Slate folder access…" }); setReload((value) => value + 1); }} />}{error && <p className="slate-plugin-error" role="alert">{error}</p>}</SlateRoot>;
}
function SlateRoot({ children }: { children: ReactNode }) { const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null); return <main className="slate-plugin"><SlateStyles /><SlatePortalContext.Provider value={portalContainer}>{children}<div className="slate-plugin-portal" ref={setPortalContainer} /></SlatePortalContext.Provider></main>; }
function DemoSlate({ browseMarkdownFile }: { browseMarkdownFile?: BrowseMarkdownFile }) {
  const [selected, setSelected] = useState<string>();
  const [managing, setManaging] = useState(false);
  const [demoSources, setDemoSources] = useState<SlateSourceDefinition[]>(createSlateDemoConfigSources);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => loadSlateFavoriteSourceIds(slateLocalStorage(), "slate-demo"));
  const metadata = demoSources.map(({ id, label, view }) => ({ id, label, view }));
  const source = metadata.find((item) => item.id === selected);
  return <SlateRoot>{managing
    ? <DocumentManagerEditor initialSources={demoSources} browseMarkdownFile={browseMarkdownFile} onCancel={() => setManaging(false)} onSave={async (next) => { setDemoSources(next); setManaging(false); }} />
    : source
      ? <SourceDocument source={source} snapshot={slateDemoSnapshots[source.id]} onBack={() => setSelected(undefined)} />
      : <><SourcePicker sources={metadata} phase="loaded" favoriteIds={favoriteIds} onSelect={setSelected} onManage={() => setManaging(true)} onToggleFavorite={(id) => setFavoriteIds((current) => { const next = toggleSlateFavoriteSourceId(current, id); saveSlateFavoriteSourceIds(slateLocalStorage(), "slate-demo", next); return next; })} /><p className="slate-plugin-demo">Preview data — native Workshop uses only your configured local files.</p></>}
  </SlateRoot>;
}
function slateLocalStorage() { try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; } }
function isSetupPreview(): boolean { return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("setup"); }
function SlateWorkspaceSetup({ initialRoot, connectedRoot, onRootChange, requestWorkspaceRoot, browseWorkspaceRoot, onCancel, onReconnect }: { initialRoot: string; connectedRoot?: string; onRootChange: (root: string) => void; requestWorkspaceRoot: (root?: string) => WorkspaceRootRequestResult | void; browseWorkspaceRoot?: BrowseWorkspaceRoot; onCancel?: () => void; onReconnect?: () => void }) {
  const [candidate, setCandidate] = useState(initialRoot);
  const [message, setMessage] = useState<{ tone: "status" | "error"; text: string }>();
  const [connecting, setConnecting] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const mounted = useRef(true);
  const connectButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const busy = connecting || browsing;
  const connect = () => {
    const nextRoot = candidate.trim();
    if (!nextRoot) { setMessage({ tone: "error", text: "Enter a folder path first." }); return; }
    setConnecting(true);
    try {
      const result = requestWorkspaceRoot(nextRoot);
      if (result && !result.ok) { setMessage({ tone: "error", text: result.message }); setConnecting(false); return; }
      if (connectedRoot && nextRoot === connectedRoot) {
        onReconnect?.();
        return;
      }
      setMessage({ tone: "status", text: "Folder selected. Waiting for Workshop to finish connecting…" });
      onRootChange(nextRoot);
    } catch {
      setMessage({ tone: "error", text: "Slate couldn't request this folder. Try again." });
      setConnecting(false);
    }
  };
  const browse = async () => {
    if (!browseWorkspaceRoot) return;
    setBrowsing(true);
    setMessage({ tone: "status", text: "Opening folder browser…" });
    try {
      const result = await browseWorkspaceRoot();
      if (!mounted.current) return;
      if (!result || (!result.ok && result.canceled)) { setBrowsing(false); setMessage(undefined); return; }
      if (!result.ok) {
        setBrowsing(false);
        setMessage({ tone: "error", text: result.message ?? "Workshop couldn't open the folder browser. Enter the path manually or try again." });
        return;
      }
      const selectedRoot = result.root.trim();
      if (!selectedRoot) {
        setBrowsing(false);
        setMessage({ tone: "error", text: "Workshop returned an empty folder path. Enter the path manually or try again." });
        return;
      }
      setCandidate(selectedRoot);
      onRootChange(selectedRoot);
      setBrowsing(false);
      setMessage({ tone: "status", text: "Folder selected. Connect when you're ready." });
      setTimeout(() => connectButton.current?.focus(), 0);
    } catch {
      if (!mounted.current) return;
      setBrowsing(false);
      setMessage({ tone: "error", text: "Workshop couldn't open the folder browser. Enter the path manually or try again." });
    }
  };
  return <section className="slate-plugin-workspace-setup" aria-labelledby="slate-folder-heading">
    <header className="slate-plugin-header"><p>Slate · local reference desk</p><h1 id="slate-folder-heading">{onCancel ? "Use a different folder" : "Connect a Slate folder"}</h1></header>
    {onCancel ? <button className="slate-plugin-back slate-plugin-secondary-back" aria-label="Back to Slate" onClick={onCancel}>← Back to Slate</button> : null}
    <form onSubmit={(event) => { event.preventDefault(); connect(); }}>
      <p className="slate-plugin-workspace-lede">{onCancel ? "Replace the current private Slate folder." : "Choose the private folder that holds this Slate setup."}</p>
      <div className="slate-plugin-workspace-field">
        <label htmlFor="slate-workspace-root">Folder containing slate.config.json</label>
        <div className="slate-plugin-workspace-path-row">
          <input id="slate-workspace-root" aria-label="Folder containing slate.config.json" aria-describedby="slate-workspace-note" value={candidate} disabled={busy} onChange={(event) => { setCandidate(event.target.value); onRootChange(event.target.value); setMessage(undefined); }} placeholder="/absolute/path/to/slate" />
          {browseWorkspaceRoot ? <button type="button" className="slate-plugin-workspace-browse" aria-label={browsing ? "Browsing…" : "Browse for Slate folder"} disabled={busy} onClick={() => { void browse(); }}>{browsing ? "Browsing…" : "Browse…"}</button> : null}
        </div>
      </div>
      <p id="slate-workspace-note" className="slate-plugin-workspace-note">Type an absolute path or browse. The folder must already contain <code>slate.config.json</code>. Slate does not search this folder or create files in it.</p>
      {message ? <p className={message.tone === "status" ? "slate-plugin-workspace-status" : "slate-plugin-error"} role={message.tone === "status" ? "status" : "alert"}>{message.text}</p> : null}
      <div className="slate-plugin-workspace-actions"><button ref={connectButton} type="submit" className="slate-plugin-workspace-connect" disabled={busy}>{connecting ? "Connecting…" : "Connect folder"}</button></div>
    </form>
  </section>;
}
function SlateWorkspaceDisconnect({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) { return <section className="slate-plugin-workspace-setup" aria-labelledby="slate-disconnect-heading"><header className="slate-plugin-header"><p>Slate · local reference desk</p><h1 id="slate-disconnect-heading">Disconnect Slate folder?</h1></header><p className="slate-plugin-workspace-lede">Slate will forget this folder's path on this computer.</p><p className="slate-plugin-workspace-note">The folder and its Markdown files will not change. You can reconnect it later.</p><div className="slate-plugin-workspace-actions"><button className="slate-plugin-workspace-disconnect" onClick={onConfirm}>Disconnect folder</button><button className="slate-plugin-workspace-cancel" onClick={onCancel}>Cancel</button></div></section>; }
function WorkspaceConfirmation({ notice, onDismiss }: { notice: WorkspaceNotice; onDismiss?: () => void }) {
  return <div className="slate-plugin-workspace-confirmation" data-state={notice.state} data-testid="workspace-confirmation">
    <div className="slate-plugin-workspace-confirmation-message" role="status">
      <span aria-hidden="true">{notice.state === "success" ? "✓" : "…"}</span>
      <strong>{notice.text}</strong>
    </div>
    {notice.state === "success" && onDismiss ? <button type="button" aria-label="Dismiss folder confirmation" onClick={onDismiss}>×</button> : null}
  </div>;
}

function SourcePicker({ sources, phase, favoriteIds, onSelect, onManage, onToggleFavorite, workspaceRoot, requestWorkspaceRoot, browseWorkspaceRoot, clearWorkspaceRoot, notice, onDismissNotice, onRefreshWorkspace }: { sources: Source[]; phase: WorkspacePhase; favoriteIds: string[]; onSelect: (id: string) => void; onManage: () => void; onToggleFavorite: (id: string) => void; workspaceRoot?: string; requestWorkspaceRoot?: (root?: string) => WorkspaceRootRequestResult | void; browseWorkspaceRoot?: BrowseWorkspaceRoot; clearWorkspaceRoot?: () => void; notice?: WorkspaceNotice; onDismissNotice?: () => void; onRefreshWorkspace?: () => void }) {
  const [changingWorkspace, setChangingWorkspace] = useState(false);
  const [disconnectingWorkspace, setDisconnectingWorkspace] = useState(false);
  const [candidateRoot, setCandidateRoot] = useState(workspaceRoot ?? "");
  const groups = partitionSlateSources(sources, favoriteIds);
  const openWorkspaceChange = () => { setCandidateRoot(workspaceRoot ?? ""); setChangingWorkspace(true); };
  const cancelWorkspaceChange = () => { setCandidateRoot(workspaceRoot ?? ""); setChangingWorkspace(false); };
  if (changingWorkspace && requestWorkspaceRoot) return <SlateWorkspaceSetup initialRoot={candidateRoot} connectedRoot={workspaceRoot} onRootChange={setCandidateRoot} requestWorkspaceRoot={requestWorkspaceRoot} browseWorkspaceRoot={browseWorkspaceRoot} onCancel={cancelWorkspaceChange} onReconnect={() => { setChangingWorkspace(false); onRefreshWorkspace?.(); }} />;
  if (disconnectingWorkspace && clearWorkspaceRoot) return <SlateWorkspaceDisconnect onConfirm={() => { clearSlateFavoriteSourceIds(slateLocalStorage(), workspaceRoot ?? ""); clearWorkspaceRoot?.(); }} onCancel={() => setDisconnectingWorkspace(false)} />;
  return <><header className="slate-plugin-header slate-plugin-source-header"><div><p>Slate · local reference desk</p><h1>Slate</h1></div><div className="slate-plugin-workspace-tools"><button className="slate-plugin-change-workspace" onClick={onManage}>Manage documents</button>{requestWorkspaceRoot ? <button className="slate-plugin-change-workspace" onClick={openWorkspaceChange}>Change Slate folder</button> : null}{clearWorkspaceRoot ? <button className="slate-plugin-disconnect-workspace" onClick={() => setDisconnectingWorkspace(true)}>Disconnect</button> : null}</div></header>
    {notice ? <WorkspaceConfirmation notice={notice} onDismiss={onDismissNotice} /> : null}
    {phase === "loading" ? (notice ? null : <p className="slate-plugin-workspace-loading" role="status">Loading configured documents…</p>) : null}
    {phase === "loaded" && groups.favorites.length ? <SourceGroup label="Favorites" sources={groups.favorites} favoriteIds={favoriteIds} onSelect={onSelect} onToggleFavorite={onToggleFavorite} /> : null}
    {phase === "loaded" && groups.documents.length ? <SourceGroup label={groups.favorites.length ? "All documents" : undefined} sources={groups.documents} favoriteIds={favoriteIds} onSelect={onSelect} onToggleFavorite={onToggleFavorite} /> : null}
    {phase === "loaded" && !sources.length ? <section className="slate-plugin-empty-documents"><h2>No documents configured</h2><p>Add a declared Markdown file to begin.</p><button onClick={onManage}>Manage documents</button></section> : null}
  </>;
}
function ManageDocuments({ workspaceRoot, browseMarkdownFile, onDone }: { workspaceRoot: string; browseMarkdownFile?: BrowseMarkdownFile; onDone: () => void }) {
  const [sources, setSources] = useState<SlateSourceDefinition[]>();
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    setSources(undefined);
    setLoadError(false);
    void invoke<SlateConfig>("read_configured_markdown_config", { workspaceRoot, configFile })
      .then((config) => { if (!disposed) setSources(config.sources); })
      .catch(() => { if (!disposed) setLoadError(true); });
    return () => { disposed = true; };
  }, [workspaceRoot, attempt]);
  if (!sources) return <ManagerState error={loadError} onBack={onDone} onRetry={() => setAttempt((value) => value + 1)} />;
  return <DocumentManagerEditor
    initialSources={sources}
    browseMarkdownFile={browseMarkdownFile}
    onCancel={onDone}
    onSave={async (next) => {
      await invoke("write_configured_markdown_config", { workspaceRoot, configFile, config: { version: 1, sources: next } });
      onDone();
    }}
  />;
}

function ManagerState({ error, onBack, onRetry }: { error: boolean; onBack: () => void; onRetry: () => void }) {
  return <section className="slate-plugin-manager" aria-labelledby="slate-manager-heading">
    <ManagerHeader />
    <button className="slate-plugin-back slate-plugin-secondary-back" aria-label="Back to Slate" onClick={onBack}>← Back to Slate</button>
    <div className="slate-plugin-manager-state" role={error ? "alert" : "status"}>
      <strong>{error ? "Slate couldn’t load this configuration." : "Loading documents…"}</strong>
      {error ? <><p>Nothing has been changed. Check Workshop’s folder access, then try again.</p><button onClick={onRetry}>Try again</button></> : null}
    </div>
  </section>;
}

function ManagerHeader() {
  return <header className="slate-plugin-header"><p>Slate · local reference desk</p><h1 id="slate-manager-heading">Manage documents</h1></header>;
}

type SourceDraftErrors = Partial<Record<"label" | "id" | "path", string>>;

function validateSourceDrafts(sources: SlateSourceDefinition[]): SourceDraftErrors[] {
  const ids = new Map<string, number>();
  const paths = new Map<string, number>();
  for (const source of sources) {
    ids.set(source.id, (ids.get(source.id) ?? 0) + 1);
    paths.set(source.path, (paths.get(source.path) ?? 0) + 1);
  }
  return sources.map((source) => {
    const errors: SourceDraftErrors = {};
    if (!source.label.trim()) errors.label = "Enter a label.";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(source.id)) errors.id = "Use lowercase letters, numbers, and hyphens.";
    else if ((ids.get(source.id) ?? 0) > 1) errors.id = "Use a unique document ID.";
    if (!isSlateMarkdownPath(source.path)) errors.path = "Enter an absolute path to a Markdown file.";
    else if ((paths.get(source.path) ?? 0) > 1) errors.path = "Use a unique Markdown path.";
    return errors;
  });
}

function markdownFileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "No file selected";
}

function nextDocumentId(sources: SlateSourceDefinition[]): string {
  const used = new Set(sources.map((source) => source.id));
  if (!used.has("new-document")) return "new-document";
  let suffix = 2;
  while (used.has(`new-document-${suffix}`)) suffix += 1;
  return `new-document-${suffix}`;
}

function useConfirmationFocus(open: boolean, initialFocus: RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    initialFocus.current?.focus();
    return () => { if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [open, initialFocus]);
}

function confirmationKeyDown(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.key === "Escape") { event.preventDefault(); close(); return; }
  if (event.key !== "Tab") return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function DocumentManagerEditor({ initialSources, browseMarkdownFile, onSave, onCancel }: { initialSources: SlateSourceDefinition[]; browseMarkdownFile?: BrowseMarkdownFile; onSave: (sources: SlateSourceDefinition[]) => Promise<void>; onCancel: () => void }) {
  const [sources, setSources] = useState<SlateSourceDefinition[]>(initialSources);
  const [selected, setSelected] = useState(initialSources.length ? 0 : -1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [showValidation, setShowValidation] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [browseMessage, setBrowseMessage] = useState<{ tone: "status" | "error"; text: string }>();
  const keepDocumentRef = useRef<HTMLButtonElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const browseButtonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);
  const browseRequest = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const dirty = JSON.stringify(sources) !== JSON.stringify(initialSources);
  const errors = validateSourceDrafts(sources);
  const source = selected >= 0 ? sources[selected] : undefined;
  const sourceErrors = selected >= 0 ? errors[selected] ?? {} : {};
  useConfirmationFocus(removing, keepDocumentRef);
  useConfirmationFocus(discarding, keepEditingRef);
  useEffect(() => () => { browseRequest.current += 1; }, []);

  const revealEditor = () => {
    if (typeof window === "undefined") return;
    const stacked = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 760px)").matches : window.innerWidth <= 760;
    if (!stacked) return;
    setTimeout(() => {
      editorRef.current?.scrollIntoView?.({ block: "start" });
      editorHeadingRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  const update = (patch: Partial<SlateSourceDefinition>) => {
    setSources((current) => current.map((item, index) => index === selected ? { ...item, ...patch } : item));
    setMessage(undefined);
    setBrowseMessage(undefined);
  };
  const add = () => {
    const next = { id: nextDocumentId(sources), label: "Untitled document", path: "", view: "markdown" as const };
    setSources((current) => [...current, next]);
    setSelected(sources.length);
    setShowValidation(false);
    setMessage(undefined);
    setBrowseMessage(undefined);
    revealEditor();
  };
  const remove = () => {
    const next = sources.filter((_, index) => index !== selected);
    setSources(next);
    setSelected(next.length ? Math.min(selected, next.length - 1) : -1);
    setRemoving(false);
    setMessage(undefined);
    setBrowseMessage(undefined);
  };
  const browse = async () => {
    if (!browseMarkdownFile || !source || browsing) return;
    const request = ++browseRequest.current;
    const target = selected;
    setBrowsing(true);
    setBrowseMessage({ tone: "status", text: "Opening file browser…" });
    try {
      const result = await browseMarkdownFile(source.path || undefined);
      if (request !== browseRequest.current || selectedRef.current !== target) return;
      if (!result || (!result.ok && result.canceled)) { setBrowseMessage(undefined); return; }
      if (!result.ok) {
        setBrowseMessage({ tone: "error", text: result.message ?? "Workshop couldn’t open the file browser. Enter the path manually or try again." });
        return;
      }
      const path = result.path.trim();
      if (!isSlateMarkdownPath(path)) {
        setBrowseMessage({ tone: "error", text: "Choose an absolute path to a Markdown file." });
        return;
      }
      if (path === source.path) {
        setBrowseMessage({ tone: "status", text: `${markdownFileName(path)} is already selected.` });
        return;
      }
      update({ path });
      setBrowseMessage({ tone: "status", text: `${markdownFileName(path)} selected. Save documents to apply this change.` });
    } catch {
      if (request === browseRequest.current && selectedRef.current === target) setBrowseMessage({ tone: "error", text: "Workshop couldn’t open the file browser. Enter the path manually or try again." });
    } finally {
      if (request === browseRequest.current && selectedRef.current === target) {
        setBrowsing(false);
        setTimeout(() => browseButtonRef.current?.focus(), 0);
      }
    }
  };
  const save = async () => {
    if (!dirty || saving || browsing) return;
    setShowValidation(true);
    if (errors.some((item) => Object.keys(item).length)) {
      setMessage("Fix the highlighted fields before saving.");
      return;
    }
    const parsed = parseSlateConfig(JSON.stringify({ version: 1, sources }));
    if (!parsed.ok) {
      setMessage(parsed.message);
      return;
    }
    setSaving(true);
    setMessage(undefined);
    try { await onSave(parsed.config.sources); }
    catch (error) { setMessage(`Slate couldn’t save these documents. ${String(error)}`); }
    finally { setSaving(false); }
  };
  const cancel = () => { if (dirty) setDiscarding(true); else onCancel(); };

  return <form className="slate-plugin-manager" aria-labelledby="slate-manager-heading" aria-busy={saving || browsing} onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <ManagerHeader />
    <button type="button" className="slate-plugin-back slate-plugin-secondary-back" aria-label="Back to Slate" onClick={cancel}>← Back to Slate</button>
    <div className="slate-plugin-manager-intro">
      <div><p>Choose a document to edit.</p><span>Slate updates only this private configuration. Markdown files are never edited.</span></div>
      <button type="button" className="slate-plugin-manager-add" disabled={saving || browsing} onClick={add}>＋ Add document</button>
    </div>
    <div className="slate-plugin-manager-layout">
      <nav className="slate-plugin-manager-index" aria-label="Configured documents">
        {sources.length ? sources.map((item, index) => {
          const view = describeSlateView(item.view);
          const label = item.label.trim() || "Untitled document";
          return <div className="slate-plugin-manager-index-row" data-selected={selected === index} key={`${item.id}-${index}`}>
            <button type="button" className="slate-plugin-manager-index-open" aria-label={`Edit ${label}`} aria-current={selected === index ? "true" : undefined} disabled={saving || browsing} onClick={() => { browseRequest.current += 1; setBrowsing(false); setBrowseMessage(undefined); setSelected(index); setRemoving(false); revealEditor(); }}>
              <span className="slate-plugin-manager-index-glyph" aria-hidden="true">{view.glyph}</span>
              <span><strong>{label}</strong><small>{view.description}</small></span>
            </button>
          </div>;
        }) : <div className="slate-plugin-manager-index-empty"><strong>No documents yet</strong><span>Add one to begin.</span></div>}
      </nav>
      <section ref={editorRef} className="slate-plugin-manager-editor" aria-label={source ? `Edit ${source.label || "document"}` : "Document editor"}>
        {source ? <>
          <div className="slate-plugin-manager-editor-header">
            <div><span>Document {selected + 1} of {sources.length}</span><h2 ref={editorHeadingRef} tabIndex={-1}>{source.label.trim() || "Untitled document"}</h2></div>
            <button type="button" className="slate-plugin-manager-remove" aria-label={`Remove ${source.label.trim() || "document"}`} disabled={saving || browsing} onClick={() => setRemoving(true)}>Remove</button>
          </div>
          {removing ? <div className="slate-plugin-manager-confirm" role="alertdialog" aria-modal="true" aria-labelledby="slate-remove-heading" aria-describedby="slate-remove-description" onKeyDown={(event) => confirmationKeyDown(event, () => setRemoving(false))}>
            <strong id="slate-remove-heading">Remove {source.label.trim() || "this document"}?</strong>
            <p id="slate-remove-description">It will disappear from Slate. The Markdown file will not be deleted.</p>
            <div><button type="button" className="slate-plugin-remove" onClick={remove}>Remove from Slate</button><button type="button" ref={keepDocumentRef} onClick={() => setRemoving(false)}>Keep document</button></div>
          </div> : null}
          <div className="slate-plugin-manager-fields">
            <ManagerField label="Label" error={showValidation ? sourceErrors.label : undefined}><input aria-label="Label" aria-invalid={Boolean(showValidation && sourceErrors.label)} disabled={saving || browsing} value={source.label} onChange={(event) => update({ label: event.target.value })} /></ManagerField>
            <ManagerField label="View"><select aria-label="View" disabled={saving || browsing} value={source.view} onChange={(event) => update({ view: event.target.value as SlateSourceDefinition["view"] })}><option value="markdown">Markdown</option><option value="markdown-tabs">Tabbed Markdown</option><option value="table">Table</option><option value="table-tabs">Tabbed tables</option></select></ManagerField>
            <div className="slate-plugin-manager-file" data-wide="true" role="group" aria-labelledby="slate-manager-file-label">
              <span id="slate-manager-file-label" className="slate-plugin-manager-file-label">Markdown file</span>
              <div className="slate-plugin-manager-file-choice" data-empty={!source.path || undefined}>
                <span className="slate-plugin-manager-file-glyph" aria-hidden="true">▤</span>
                <span className="slate-plugin-manager-file-copy"><strong>{markdownFileName(source.path)}</strong><small title={source.path}>{source.path || "Choose an existing .md file."}</small></span>
                {browseMarkdownFile ? <button ref={browseButtonRef} type="button" className="slate-plugin-manager-file-browse" aria-label={`${source.path ? "Change" : "Choose"} Markdown file for ${source.label.trim() || "document"}`} disabled={browsing || saving} onClick={() => { void browse(); }}>{browsing ? "Choosing…" : source.path ? "Change file…" : "Choose file…"}</button> : null}
              </div>
              {browseMessage ? <p className={browseMessage.tone === "error" ? "slate-plugin-manager-file-error" : "slate-plugin-manager-file-status"} role={browseMessage.tone === "error" ? "alert" : "status"}>{browseMessage.text}</p> : null}
              <details className="slate-plugin-manager-manual-path" open={!browseMarkdownFile || (showValidation && Boolean(sourceErrors.path)) ? true : undefined}>
                <summary>Enter path manually</summary>
                {!browseMarkdownFile ? <p>File browsing is unavailable in this host.</p> : null}
                <ManagerField label="Absolute Markdown path" error={showValidation ? sourceErrors.path : undefined} hint="Slate reads only this declared file; it never searches the folder."><input aria-label="Absolute Markdown path" aria-invalid={Boolean(showValidation && sourceErrors.path)} disabled={saving || browsing} value={source.path} onChange={(event) => update({ path: event.target.value })} placeholder="/absolute/path/to/document.md" /></ManagerField>
              </details>
            </div>
          </div>
          <details className="slate-plugin-manager-advanced" open={showValidation && Boolean(sourceErrors.id) ? true : undefined}>
            <summary>Advanced</summary>
            <ManagerField label="Document ID" error={showValidation ? sourceErrors.id : undefined} hint="Stable lowercase identifier used by Slate."><input aria-label="Document ID" aria-invalid={Boolean(showValidation && sourceErrors.id)} disabled={saving || browsing} value={source.id} onChange={(event) => update({ id: event.target.value })} /></ManagerField>
          </details>
        </> : <div className="slate-plugin-manager-editor-empty"><strong>No document selected</strong><p>Add a document to create its Slate configuration.</p><button type="button" onClick={add}>Add document</button></div>}
      </section>
    </div>
    {message ? <p className="slate-plugin-manager-message" role="alert">{message}</p> : null}
    {discarding ? <div className="slate-plugin-manager-confirm slate-plugin-manager-discard" role="alertdialog" aria-modal="true" aria-labelledby="slate-discard-heading" aria-describedby="slate-discard-description" onKeyDown={(event) => confirmationKeyDown(event, () => setDiscarding(false))}>
      <strong id="slate-discard-heading">Discard changes?</strong><p id="slate-discard-description">Your Slate configuration has not been changed.</p>
      <div><button type="button" className="slate-plugin-remove" onClick={onCancel}>Discard changes</button><button type="button" ref={keepEditingRef} onClick={() => setDiscarding(false)}>Keep editing</button></div>
    </div> : null}
    <footer className="slate-plugin-manager-footer">
      <span>{dirty ? "Unsaved changes" : `${sources.length} configured ${sources.length === 1 ? "document" : "documents"}`}</span>
      <div><button type="button" className="slate-plugin-workspace-cancel" disabled={saving || browsing} onClick={cancel}>Cancel</button><button type="submit" className="slate-plugin-workspace-connect" disabled={saving || browsing || !dirty}>{saving ? "Saving…" : "Save documents"}</button></div>
    </footer>
  </form>;
}

function ManagerField({ label, hint, error, wide, children }: { label: string; hint?: string; error?: string; wide?: boolean; children: ReactNode }) {
  return <label className="slate-plugin-manager-field" data-wide={wide || undefined}><span>{label}</span>{children}{error ? <small className="slate-plugin-manager-field-error">{error}</small> : hint ? <small>{hint}</small> : null}</label>;
}
function SourceGroup({ label, sources, favoriteIds, onSelect, onToggleFavorite }: { label?: string; sources: Source[]; favoriteIds: string[]; onSelect: (id: string) => void; onToggleFavorite: (id: string) => void }) { return <section className="slate-plugin-source-group" aria-label={label}>{label ? <h2>{label === "Favorites" ? <span className="slate-plugin-favorites-glyph" aria-hidden="true">★</span> : null}{label}</h2> : null}<nav className="slate-plugin-sources" aria-label={label ? `Slate ${label.toLowerCase()}` : "Slate sources"}>{sources.map((source) => <SourceCard key={source.id} source={source} favorite={favoriteIds.includes(source.id)} onSelect={onSelect} onToggleFavorite={onToggleFavorite} />)}</nav></section>; }
function SourceCard({ source, favorite, onSelect, onToggleFavorite }: { source: Source; favorite: boolean; onSelect: (id: string) => void; onToggleFavorite: (id: string) => void }) { const view = describeSlateView(source.view); return <article className="slate-plugin-source-card"><button className="slate-plugin-source-open" onClick={() => onSelect(source.id)}><span className="slate-plugin-source-glyph" aria-hidden="true">{view.glyph}</span><span className="slate-plugin-source-copy"><strong>{source.label}</strong><small>{view.description}</small></span></button><button className="slate-plugin-source-favorite" aria-label={favorite ? `Remove ${source.label} from favorites` : `Add ${source.label} to favorites`} aria-pressed={favorite} onClick={() => onToggleFavorite(source.id)} title={favorite ? "Remove from favorites" : "Add to favorites"}><span aria-hidden="true">{favorite ? "★" : "☆"}</span></button></article>; }
function SourceDocument({ source, snapshot, onBack }: { source: Source; snapshot?: SlateSnapshot; onBack: () => void }) { return <><header className="slate-plugin-header"><p>Slate · local reference desk</p><h1>{source.label}</h1></header><button className="slate-plugin-back" onClick={onBack}>‹ Slate</button><div className="slate-plugin-panel-heading slate-plugin-panel-heading-meta"><LastEdited updatedAt={snapshot?.updatedAt} /></div><View source={source} snapshot={snapshot} /></>; }
function LastEdited({ updatedAt }: { updatedAt?: number }) { if (!updatedAt) return null; const date = new Date(updatedAt); return <time className="slate-plugin-last-edited" dateTime={date.toISOString()}><span aria-hidden="true">◷</span> Updated {date.toLocaleString()}</time>; }
function isBrowserPreview(): boolean { return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window); }
function View({ source, snapshot }: { source?: Source; snapshot?: SlateSnapshot }) { if (!source) return <p>Awaiting configured sources.</p>; if (!snapshot) return <p>Loading…</p>; if (source.view === "table") try { return <SortableTable table={parseMarkdownTable(snapshot.contents)} />; } catch { return <p role="alert">Slate could not render this table.</p>; } const sections = parseMarkdownSections(snapshot.contents); if (source.view === "table-tabs") return <TableTabs sections={sections} />; return source.view === "markdown-tabs" ? <Tabs sections={sections} /> : <Sections sections={sections} />; }
function SortableTable({ table }: { table: ReturnType<typeof parseMarkdownTable> }) { const portalContainer = useContext(SlatePortalContext); const [sort, setSort] = useState<{ column: number; direction: TableSortDirection }>(); const rows = sort ? sortTableRows(table.rows, sort.column, sort.direction) : table.rows; const toggleSort = (column: number) => setSort((current) => current?.column === column && current.direction === "ascending" ? { column, direction: "descending" } : { column, direction: "ascending" }); return <TooltipPrimitive.Provider delayDuration={350}><ScrollAreaPrimitive.Root className="slate-plugin-table"><ScrollAreaPrimitive.Viewport className="slate-plugin-table-viewport"><table><thead><tr>{table.headers.map((header, column) => { const direction = sort?.column === column ? sort.direction : "none"; const nextDirection = direction === "ascending" ? "descending" : "ascending"; return <th key={header} aria-sort={direction}><TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild><button aria-label={`Sort ${header} ${nextDirection}`} onClick={() => toggleSort(column)}>{header}<span aria-hidden="true">{direction === "ascending" ? " ↑" : direction === "descending" ? " ↓" : " ↕"}</span></button></TooltipPrimitive.Trigger><TooltipPrimitive.Portal container={portalContainer ?? undefined}><TooltipPrimitive.Content className="slate-plugin-tooltip" sideOffset={6}>Sort {header} {nextDirection}<TooltipPrimitive.Arrow className="slate-plugin-tooltip-arrow" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root></th>; })}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.join("-")}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex}><InlineMarkdown value={cell} /></td>)}</tr>)}</tbody></table></ScrollAreaPrimitive.Viewport><ScrollAreaPrimitive.Scrollbar className="slate-plugin-scrollbar" orientation="horizontal"><ScrollAreaPrimitive.Thumb className="slate-plugin-scrollbar-thumb" /></ScrollAreaPrimitive.Scrollbar></ScrollAreaPrimitive.Root></TooltipPrimitive.Provider>; }
function Tabs({ sections }: { sections: ReturnType<typeof parseMarkdownSections> }) { const { intro, tabs } = splitTabbedDocument(sections); if (!tabs.length) return <Sections sections={intro} />; return <>{intro.length ? <div className="slate-plugin-tab-intro"><Sections sections={intro} /></div> : null}<TabsPrimitive.Root defaultValue={tabs[0].id}><TabsPrimitive.List className="slate-plugin-tabs" aria-label="Document sections">{tabs.map((item) => <TabsPrimitive.Trigger key={item.id} value={item.id}>{item.label}</TabsPrimitive.Trigger>)}</TabsPrimitive.List>{tabs.map((item) => <TabsPrimitive.Content key={item.id} value={item.id}><Sections sections={item.sections} /></TabsPrimitive.Content>)}</TabsPrimitive.Root></>; }
function TableTabs({ sections }: { sections: ReturnType<typeof parseMarkdownSections> }) { const { intro, tabs } = splitTabbedDocument(sections); if (!tabs.length) return <p role="alert">Slate could not find any tabbed tables in this document.</p>; return <>{intro.length ? <div className="slate-plugin-tab-intro"><Sections sections={intro} /></div> : null}<TabsPrimitive.Root defaultValue={tabs[0].id}><TabsPrimitive.List className="slate-plugin-tabs" aria-label="Document tables">{tabs.map((item) => <TabsPrimitive.Trigger key={item.id} value={item.id}>{item.label}</TabsPrimitive.Trigger>)}</TabsPrimitive.List>{tabs.map((item) => <TabsPrimitive.Content key={item.id} value={item.id}><TabTable sections={item.sections} /></TabsPrimitive.Content>)}</TabsPrimitive.Root></>; }
function TabTable({ sections }: { sections: ReturnType<typeof parseMarkdownSections> }) { const result = parseScopedMarkdownTable(sections); const summary = sections.flatMap((section) => section.paragraphs).filter((paragraph) => !paragraph.trim().startsWith("|")); return <>{summary.length ? <div className="slate-plugin-table-summary">{summary.map((paragraph, index) => <p key={index}><InlineMarkdown value={paragraph} /></p>)}</div> : null}{!result.ok ? <p className="slate-plugin-empty-table" role="status">{result.message}</p> : <SortableTable table={result.table} />}</>; }
function Sections({ sections }: { sections: ReturnType<typeof parseMarkdownSections> }) { return <div className="slate-plugin-content">{sections.map((section, index) => <Section key={`${section.heading}-${index}`} section={section} />)}</div>; }
function Section({ section }: { section: ReturnType<typeof parseMarkdownSections>[number] }) { const Heading = slateHeadingTag(section.level); const className = section.level === 1 ? "slate-plugin-main-heading" : section.level === 2 ? "slate-plugin-subheading" : "slate-plugin-minor-heading"; return <section><Heading className={className}><InlineMarkdown value={section.heading} /></Heading>{section.paragraphs.map((paragraph, item) => <p key={item}><InlineMarkdown value={paragraph} /></p>)}{section.items.length ? <ul>{section.items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown value={item} /></li>)}</ul> : null}</section>; }
function InlineMarkdown({ value }: { value: string }) { return <>{parseInlineMarkdown(value).map((token, index) => token.type === "strong" ? <strong key={index}>{token.value}</strong> : token.type === "link" ? <SlateExternalLink key={index} href={token.href}>{token.label}</SlateExternalLink> : <span key={index}>{token.value}</span>)}</>; }
function SlateExternalLink({ href, children }: { href: string; children: string }) { const browser = typeof window === "undefined" ? undefined : window; const tauri = isSlateTauriRuntime(browser); const [error, setError] = useState<string>(); const open = async (event: MouseEvent<HTMLAnchorElement>) => { if (!tauri) return; event.preventDefault(); const message = await openSlateExternalUrl(href, (command, args) => invoke(command, args)); setError(message); }; return <><a href={href} onClick={open} rel="noreferrer" target={slateLinkTarget(browser)}>{children}</a>{error ? <span className="slate-plugin-link-error" role="alert">{error}</span> : null}</>; }
function SlateStyles() { return <style>{`
  .slate-plugin{--slate-canvas:${hostTheme.canvas};--slate-surface:${hostTheme.surface};--slate-surface-raised:${hostTheme["surface-raised"]};--slate-border:${hostTheme.border};--slate-text:${hostTheme.text};--slate-text-muted:${hostTheme["text-muted"]};--slate-accent:${hostTheme.accent};--slate-accent-strong:${hostTheme["accent-strong"]};--slate-accent-warm:${hostTheme["accent-warm"]};--slate-focus:${hostTheme["focus-ring"]};--slate-success:${hostTheme.success};--slate-warning:${hostTheme.warning};--slate-danger:${hostTheme.danger};--slate-favorite:${slateOwnedSemanticColors.favorite};--slate-gradient:linear-gradient(135deg,${hostTheme["gradient-start"]},${hostTheme["gradient-middle"]},${hostTheme["gradient-end"]});background:var(--slate-canvas);color:var(--slate-text);max-width:1040px;padding:4px 0 96px;font:14px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}
  .slate-plugin h1{font-size:32px;line-height:1.1;margin:2px 0 0;letter-spacing:-.03em}
  .slate-plugin-header{border-bottom:1px solid var(--slate-border);padding:8px 0 13px}
  .slate-plugin-header p{color:var(--slate-accent);font-size:14px;font-weight:800;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em}
  .slate-plugin button{background:var(--slate-surface-raised);border:1px solid var(--slate-border);border-radius:7px;color:var(--slate-text);cursor:pointer;padding:7px 11px;font:inherit}
  .slate-plugin button:focus-visible,.slate-plugin input:focus-visible,.slate-plugin select:focus-visible{outline:2px solid var(--slate-focus);outline-offset:2px}
  .slate-plugin button:disabled{color:var(--slate-text-muted);cursor:not-allowed;opacity:.58}
  .slate-plugin-source-header{align-items:end;display:flex;justify-content:space-between;gap:18px}
  .slate-plugin-workspace-tools{align-items:center;display:flex;gap:6px;margin:0 0 1px}
  .slate-plugin-change-workspace{background:transparent!important;border-color:var(--slate-accent-warm)!important;color:var(--slate-accent-warm)!important;font-size:12px!important;margin:0 0 1px;padding:5px 8px!important;white-space:nowrap}
  .slate-plugin-change-workspace:hover{border-color:var(--slate-focus)!important;color:var(--slate-text)!important}
  .slate-plugin-disconnect-workspace{background:transparent!important;border-color:transparent!important;color:var(--slate-text-muted)!important;font-size:12px!important;padding:5px 6px!important;white-space:nowrap}
  .slate-plugin-disconnect-workspace:hover{color:var(--slate-danger)!important}
  .slate-plugin-workspace-setup{max-width:590px;padding-top:8px}
  .slate-plugin-workspace-lede{color:var(--slate-text);font-size:16px;margin:18px 0 18px;max-width:500px}
  .slate-plugin-workspace-field{display:grid;gap:6px}
  .slate-plugin-workspace-field>label{color:var(--slate-text);font-size:13px;font-weight:700}
  .slate-plugin-workspace-path-row{display:grid;gap:8px;grid-template-columns:minmax(0,1fr) auto}
  .slate-plugin-workspace-path-row input{box-sizing:border-box;min-width:0;width:100%}
  .slate-plugin-workspace-browse{background:var(--slate-surface)!important;border-color:var(--slate-border)!important;color:var(--slate-text)!important;font-weight:700;min-width:92px}
  .slate-plugin-workspace-browse:hover:not(:disabled){border-color:var(--slate-accent-warm)!important;color:var(--slate-accent-warm)!important}
  .slate-plugin input,.slate-plugin select{background:var(--slate-surface);border:1px solid var(--slate-border);border-radius:7px;color:var(--slate-text);font:inherit;padding:10px 11px}
  .slate-plugin-workspace-note{color:var(--slate-text-muted);font-size:12px;line-height:1.55;margin:8px 0 0;max-width:510px}
  .slate-plugin-workspace-note code{color:var(--slate-text)}
  .slate-plugin-workspace-status{color:var(--slate-text-muted);font-size:12px;margin:12px 0 0}
  .slate-plugin-workspace-actions{display:flex;gap:8px;margin-top:16px}
  .slate-plugin-workspace-confirmation{align-items:center;background:var(--slate-surface);border-left:3px solid var(--slate-border);color:var(--slate-text);display:grid;gap:9px;grid-template-columns:1fr auto;margin:14px 0 18px;padding:9px 11px}
  .slate-plugin-workspace-confirmation[data-state="success"]{background:color-mix(in srgb,var(--slate-success) 9%,var(--slate-canvas));border-left-color:var(--slate-success)}
  .slate-plugin-workspace-confirmation-message{align-items:center;display:grid;gap:9px;grid-template-columns:auto 1fr}
  .slate-plugin-workspace-confirmation-message>span{color:var(--slate-text-muted);font-weight:800}
  .slate-plugin-workspace-confirmation[data-state="success"] .slate-plugin-workspace-confirmation-message>span{color:var(--slate-success)}
  .slate-plugin-workspace-confirmation-message>strong{font-size:12px}
  .slate-plugin-workspace-confirmation>button{background:transparent!important;border:0!important;color:var(--slate-text-muted)!important;font-size:18px!important;line-height:1!important;padding:0 3px!important}
  .slate-plugin-workspace-loading{color:var(--slate-text-muted);font-size:12px;margin:18px 0}
  .slate-plugin-manager{max-width:960px}
  .slate-plugin-manager-intro{align-items:center;display:flex;gap:24px;justify-content:space-between;margin:20px 0 18px}
  .slate-plugin-manager-intro p{color:var(--slate-text);font-size:16px;font-weight:750;margin:0 0 2px}
  .slate-plugin-manager-intro span{color:var(--slate-text-muted);font-size:12px}
  .slate-plugin-manager-add{background:var(--slate-surface)!important;border-color:var(--slate-accent-warm)!important;color:var(--slate-accent-warm)!important;font-weight:700;white-space:nowrap}
  .slate-plugin-manager-layout{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);min-height:410px;border-bottom:1px solid var(--slate-border);border-top:1px solid var(--slate-border)}
  .slate-plugin-manager-index{border-right:1px solid var(--slate-border);padding:10px 12px 10px 0}
  .slate-plugin-manager-index-row{border-left:3px solid transparent;margin:1px 0;padding-left:2px}
  .slate-plugin-manager-index-row[data-selected=true]{background:var(--slate-surface-raised);border-left-color:var(--slate-accent)}
  .slate-plugin-manager-index-open{align-items:center;background:transparent!important;border:0!important;display:flex;gap:10px;min-width:0;padding:9px 7px!important;text-align:left}
  .slate-plugin-manager-index-open>span:last-child{display:grid;min-width:0}
  .slate-plugin-manager-index-open strong{color:var(--slate-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .slate-plugin-manager-index-open small{color:var(--slate-text-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .slate-plugin-manager-index-glyph{color:var(--slate-accent);font-size:18px}
  .slate-plugin-manager-index-empty{color:var(--slate-text-muted);display:grid;gap:2px;padding:18px 12px}
  .slate-plugin-manager-index-empty strong{color:var(--slate-text)}
  .slate-plugin-manager-editor{min-width:0;padding:22px 0 26px 28px}
  .slate-plugin-manager-editor-header{align-items:start;display:flex;gap:20px;justify-content:space-between;margin-bottom:22px}
  .slate-plugin-manager-editor-header span{color:var(--slate-text-muted);font-size:11px;letter-spacing:.07em;text-transform:uppercase}
  .slate-plugin-manager-editor-header h2{color:var(--slate-accent);font-size:22px;line-height:1.2;margin:3px 0 0}
  .slate-plugin-manager-remove{background:transparent!important;border:0!important;color:var(--slate-danger)!important;font-size:12px!important;padding:4px!important}
  .slate-plugin-manager-fields{display:grid;gap:16px;grid-template-columns:minmax(0,1.5fr) minmax(170px,.8fr)}
  .slate-plugin-manager-field{color:var(--slate-text);display:grid;gap:6px;min-width:0}
  .slate-plugin-manager-field[data-wide=true]{grid-column:1/-1}
  .slate-plugin-manager-field>span{font-size:12px;font-weight:750}
  .slate-plugin-manager-field input,.slate-plugin-manager-field select{box-sizing:border-box;min-width:0;width:100%}
  .slate-plugin-manager-field small{color:var(--slate-text-muted);font-size:11px}
  .slate-plugin-manager-field input[aria-invalid=true]{border-color:var(--slate-danger)}
  .slate-plugin-manager-field-error{color:var(--slate-danger)!important}
  .slate-plugin-manager-file{display:grid;gap:6px;grid-column:1/-1;min-width:0}
  .slate-plugin-manager-file-label{color:var(--slate-text);font-size:12px;font-weight:750}
  .slate-plugin-manager-file-choice{align-items:center;background:var(--slate-surface);border:1px solid var(--slate-border);border-radius:8px;display:grid;gap:10px;grid-template-columns:auto minmax(0,1fr) auto;padding:10px 11px}
  .slate-plugin-manager-file-choice[data-empty=true]{border-style:dashed}
  .slate-plugin-manager-file-glyph{color:var(--slate-accent);font-size:20px;line-height:1}
  .slate-plugin-manager-file-copy{display:grid;min-width:0}
  .slate-plugin-manager-file-copy strong{color:var(--slate-text);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .slate-plugin-manager-file-copy small{color:var(--slate-text-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .slate-plugin-manager-file-browse{background:var(--slate-surface-raised)!important;border-color:var(--slate-border)!important;font-size:12px!important;font-weight:700;white-space:nowrap}
  .slate-plugin-manager-file-browse:hover:not(:disabled){border-color:var(--slate-accent-warm)!important;color:var(--slate-accent-warm)!important}
  .slate-plugin-manager-file-status,.slate-plugin-manager-file-error{font-size:11px;margin:1px 0 0}
  .slate-plugin-manager-file-status{color:var(--slate-text-muted)}
  .slate-plugin-manager-file-error{color:var(--slate-danger)}
  .slate-plugin-manager-manual-path{border-top:1px solid var(--slate-border);margin-top:7px;padding-top:10px}
  .slate-plugin-manager-manual-path summary{color:var(--slate-text-muted);cursor:pointer;font-size:11px;margin-bottom:10px;width:max-content}
  .slate-plugin-manager-manual-path>p{color:var(--slate-warning);font-size:11px;margin:0 0 8px}
  .slate-plugin-manager-advanced{border-top:1px solid var(--slate-border);margin-top:22px;padding-top:13px}
  .slate-plugin-manager-advanced summary{color:var(--slate-text-muted);cursor:pointer;font-size:12px;margin-bottom:14px}
  .slate-plugin-manager-confirm{background:color-mix(in srgb,var(--slate-danger) 8%,var(--slate-canvas));border-left:3px solid var(--slate-danger);margin:0 0 20px;padding:12px 14px}
  .slate-plugin-manager-confirm strong{color:var(--slate-text)}
  .slate-plugin-manager-confirm p{color:var(--slate-text-muted);font-size:12px;margin:3px 0 10px}
  .slate-plugin-manager-confirm>div{display:flex;gap:7px}
  .slate-plugin-manager-message{color:var(--slate-danger);font-size:12px;margin:12px 0}
  .slate-plugin-manager-discard{margin:14px 0 0}
  .slate-plugin-manager-footer{align-items:center;background:var(--slate-canvas);bottom:0;display:flex;gap:20px;justify-content:space-between;padding:14px 0;position:sticky;z-index:2}
  .slate-plugin-manager-footer>span{color:var(--slate-text-muted);font-size:12px}
  .slate-plugin-manager-footer>div{display:flex;gap:8px}
  .slate-plugin-manager-editor-empty,.slate-plugin-manager-state{color:var(--slate-text-muted);padding:30px 0}
  .slate-plugin-manager-editor-empty strong,.slate-plugin-manager-state strong{color:var(--slate-text);font-size:16px}
  .slate-plugin-manager-editor-empty p,.slate-plugin-manager-state p{margin:5px 0 14px}
  .slate-plugin-workspace-connect{background:var(--slate-accent)!important;border-color:var(--slate-accent)!important;color:var(--slate-canvas)!important;font-weight:800}
  .slate-plugin-workspace-connect:hover{background:var(--slate-accent-strong)!important;border-color:var(--slate-accent-strong)!important}
  .slate-plugin-workspace-disconnect,.slate-plugin-remove{background:transparent!important;border-color:var(--slate-danger)!important;color:var(--slate-danger)!important}
  .slate-plugin-workspace-disconnect:hover,.slate-plugin-remove:hover{background:color-mix(in srgb,var(--slate-danger) 10%,transparent)!important}
  .slate-plugin-workspace-cancel{background:transparent!important;border-color:transparent!important;color:var(--slate-text-muted)!important}
  .slate-plugin-workspace-cancel:hover{color:var(--slate-text)!important}
  .slate-plugin-source-group{margin:18px 0 25px}
  .slate-plugin-source-group h2{align-items:center;color:var(--slate-accent-warm);display:flex;font-size:13px;letter-spacing:.08em;margin:0 0 8px;text-transform:uppercase}
  .slate-plugin-favorites-glyph{color:var(--slate-favorite);margin-right:5px}
  .slate-plugin-sources{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))}
  .slate-plugin-source-card{background:var(--slate-surface);border:1px solid var(--slate-border);border-radius:8px;display:grid;grid-template-columns:minmax(0,1fr) auto;min-width:0;overflow:hidden}
  .slate-plugin-source-card:hover{background:var(--slate-surface-raised);border-color:var(--slate-accent)}
  .slate-plugin-source-open{align-items:center;background:transparent!important;border:0!important;border-radius:0!important;display:flex;gap:11px;min-width:0;padding:12px 4px 12px 13px!important;text-align:left}
  .slate-plugin-source-open:focus-visible{outline-offset:-3px}
  .slate-plugin-source-favorite{align-self:start;background:transparent!important;border:0!important;border-radius:0!important;color:var(--slate-text-muted)!important;font-size:21px!important;line-height:1!important;margin:7px 7px 0 0;padding:3px!important}
  .slate-plugin-source-favorite:hover,.slate-plugin-source-favorite[aria-pressed=true]{color:var(--slate-favorite)!important}
  .slate-plugin-source-favorite:focus-visible{outline-offset:0}
  .slate-plugin-source-glyph{color:var(--slate-accent);font-size:22px;line-height:1}
  .slate-plugin-source-copy{display:grid;gap:2px;min-width:0}
  .slate-plugin-source-copy strong{color:var(--slate-text);font-size:15px}
  .slate-plugin-source-copy small{color:var(--slate-text-muted);font-size:12px}
  .slate-plugin-back{background:transparent!important;border:0!important;border-radius:0!important;color:var(--slate-accent-warm)!important;margin:11px 0 0;padding:0!important}
  .slate-plugin-back:hover{color:var(--slate-text)!important}
  .slate-plugin-secondary-back{font-weight:700!important;margin-top:14px}
  .slate-plugin-panel-heading{align-items:center;display:flex;justify-content:space-between;gap:16px;margin-top:13px}
  .slate-plugin-panel-heading-meta{justify-content:flex-end}
  .slate-plugin-panel-heading p{color:var(--slate-text);font-size:14px;font-weight:700;margin:0}
  .slate-plugin-panel-heading span,.slate-plugin-last-edited{color:var(--slate-text-muted);font-size:12px}
  .slate-plugin-last-edited{align-items:center;display:flex;gap:5px;white-space:nowrap}
  .slate-plugin-tabs{border-bottom:1px solid var(--slate-border);display:flex;gap:4px;margin:14px 0 24px;overflow-x:auto;padding:0 3px}
  .slate-plugin-tabs button{background:transparent;border:1px solid transparent;border-bottom:0;border-radius:7px 7px 0 0;color:var(--slate-text-muted);margin-bottom:-1px;padding:7px 11px;white-space:nowrap}
  .slate-plugin-tabs button:hover{color:var(--slate-text)}
  .slate-plugin-tabs button[data-state=active]{background:var(--slate-surface-raised);border-color:var(--slate-border);color:var(--slate-accent-warm);font-weight:700}
  .slate-plugin-tabs button:focus-visible{outline-offset:3px}
  .slate-plugin-content{max-width:820px}
  .slate-plugin-panel-heading + .slate-plugin-content{margin-top:22px}
  .slate-plugin-content section{margin:0 0 20px}
  .slate-plugin-content h2{line-height:1.25;margin:0 0 6px;letter-spacing:-.03em}
  .slate-plugin-main-heading{color:var(--slate-accent);font-size:23px}
  .slate-plugin-subheading{color:var(--slate-accent-warm);font-size:17px}
  .slate-plugin-minor-heading{color:var(--slate-text);font-size:15px;font-weight:650}
  .slate-plugin-content p{color:var(--slate-text);margin:0 0 7px}
  .slate-plugin a{color:var(--slate-accent-warm);text-decoration-color:var(--slate-accent-warm);text-underline-offset:2px}
  .slate-plugin a:hover{color:var(--slate-accent);text-decoration-color:var(--slate-accent)}
  .slate-plugin-link-error{color:var(--slate-danger);display:block;font-size:12px;margin-top:4px}
  .slate-plugin-content ul{list-style:none;margin:5px 0 0;padding-left:18px}
  .slate-plugin-content li{margin:3px 0;position:relative}
  .slate-plugin-content ul li::before{color:var(--slate-text-muted);content:"–";left:-15px;position:absolute}
  .slate-plugin-table-summary{color:var(--slate-text);max-width:820px}
  .slate-plugin-table-summary p{margin:0 0 8px}
  .slate-plugin-table{border:1px solid var(--slate-border);border-radius:8px;margin-top:14px;overflow:hidden}
  .slate-plugin-table-viewport{overflow:auto}
  .slate-plugin table{border-collapse:collapse;width:100%;min-width:580px}
  .slate-plugin th,.slate-plugin td{padding:11px 10px;text-align:left;border-bottom:1px solid var(--slate-border);vertical-align:top}
  .slate-plugin th{color:var(--slate-accent-warm);background:var(--slate-surface-raised);font-size:11px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
  .slate-plugin tbody tr:hover{background:var(--slate-surface)}
  .slate-plugin th button{appearance:none;background:transparent;border:0;border-radius:0;color:inherit;cursor:pointer;font:inherit;padding:0}
  .slate-plugin-scrollbar{background:var(--slate-surface-raised);display:flex;height:8px;padding:2px}
  .slate-plugin-scrollbar-thumb{background:var(--slate-text-muted);border-radius:99px;flex:1}
  .slate-plugin-tooltip{background:var(--slate-text);border-radius:5px;color:var(--slate-canvas);font-size:12px;padding:5px 7px;z-index:100}
  .slate-plugin-tooltip-arrow{fill:var(--slate-text)}
  .slate-plugin-error{color:var(--slate-danger)}
  .slate-plugin-demo{color:var(--slate-text-muted);font-size:12px;margin:14px 0 0}
  @media (max-width:760px){.slate-plugin-sources{grid-template-columns:repeat(2,minmax(0,1fr))}.slate-plugin-manager-layout{grid-template-columns:1fr}.slate-plugin-manager-index{border-bottom:1px solid var(--slate-border);border-right:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:10px 0}.slate-plugin-manager-editor{padding:22px 0;scroll-margin-top:16px}.slate-plugin-manager-index-empty{grid-column:1/-1}.slate-plugin-manager-footer{position:static}}
  @media (max-width:520px){.slate-plugin-sources{grid-template-columns:1fr}.slate-plugin-source-header{align-items:start;flex-direction:column}.slate-plugin-workspace-tools{margin-top:4px}.slate-plugin-change-workspace{margin-top:0}.slate-plugin-workspace-path-row{grid-template-columns:1fr}.slate-plugin-workspace-browse{justify-self:start}.slate-plugin-manager-intro{align-items:start;flex-direction:column}.slate-plugin-manager-index{grid-template-columns:1fr}.slate-plugin-manager-fields{grid-template-columns:1fr}.slate-plugin-manager-file-choice{align-items:start;grid-template-columns:auto minmax(0,1fr)}.slate-plugin-manager-file-browse{grid-column:1/-1;justify-self:start}.slate-plugin-manager-footer{align-items:stretch;flex-direction:column}.slate-plugin-manager-footer>div{justify-content:flex-end}}
`}</style>; }
