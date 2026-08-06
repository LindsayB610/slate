import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildTopLevelTabs, parseMarkdownSections, parseMarkdownTable, type SlateSourceDefinition } from "./index.js";
import { describeSlateView, keepLatestSnapshot, parseInlineMarkdown, releaseIfDisposed, retainSelectedSource, shouldRefreshSource, slateDemoSnapshots, slateDemoSources, sortTableRows, validateSourceMetadata, type SlateSnapshot, type SlateSourceChange, type TableSortDirection } from "./pluginModel.js";

type Source = Pick<SlateSourceDefinition, "id" | "label" | "view">;
const configFile = "slate.config.json";
export type WorkshopToolViewProps = { activeRouteId?: string; workspaceRoot?: string; requestWorkspaceRoot: (root?: string) => void };

export function WorkshopToolView({ workspaceRoot, requestWorkspaceRoot }: WorkshopToolViewProps) {
  const [root, setRoot] = useState(""); const [sources, setSources] = useState<Source[]>([]); const [selected, setSelected] = useState<string>();
  const [data, setData] = useState<Record<string, SlateSnapshot>>({}); const [error, setError] = useState<string>(); const versions = useRef<Record<string, number>>({});
  const read = useCallback(async (id: string, active: () => boolean = () => true) => { if (!workspaceRoot) return; const version = (versions.current[id] ?? 0) + 1; versions.current[id] = version; try { const result = await invoke<SlateSnapshot>("read_configured_markdown_source", { workspaceRoot, configFile, source: id }); if (!active()) return; setData((old) => keepLatestSnapshot(old, id, version, versions.current[id], result)); if (versions.current[id] === version) setError(undefined); } catch (cause) { if (active() && versions.current[id] === version) setError(cause instanceof Error ? cause.message : "Slate could not read this source."); } }, [workspaceRoot]);
  useEffect(() => { if (!workspaceRoot) return; let disposed = false; let stop: (() => void) | undefined; const active = () => !disposed; void (async () => { try { const raw = await invoke<unknown>("read_configured_markdown_sources", { workspaceRoot, configFile }); if (!active()) return; const listed = validateSourceMetadata(raw); if (!listed) throw new Error("Slate configuration contains unsupported source metadata."); setSources(listed); setSelected((old) => retainSelectedSource(old, listed)); await Promise.all(listed.map((source) => read(source.id, active))); if (!active()) return; const lateStop = await listen<SlateSourceChange>("local-markdown://source-changed", (event) => { if (shouldRefreshSource(workspaceRoot, event.payload, configFile)) void read(event.payload.source, active); }); if (releaseIfDisposed(disposed, lateStop)) return; stop = lateStop; await invoke("start_configured_markdown_watch", { workspaceRoot, configFile }); } catch (cause) { if (active()) setError(cause instanceof Error ? cause.message : "Slate could not load its private configuration."); } })(); return () => { disposed = true; stop?.(); }; }, [workspaceRoot, read]);
  if (!workspaceRoot && isBrowserPreview()) return <DemoSlate />;
  if (!workspaceRoot) return <main className="slate-plugin"><SlateStyles /><h1>Slate</h1><p>View explicitly configured local Markdown files.</p><input aria-label="Slate private folder" value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/absolute/path/to/slate" /><button onClick={() => requestWorkspaceRoot(root.trim() || undefined)}>Connect Slate</button></main>;
  const source = sources.find((item) => item.id === selected); return <main className="slate-plugin"><SlateStyles />{source ? <SourceDocument source={source} snapshot={data[source.id]} onBack={() => setSelected(undefined)} /> : <SourcePicker sources={sources} onSelect={setSelected} />}{error && <p className="slate-plugin-error" role="alert">{error}</p>}</main>;
}
function DemoSlate() { const [selected, setSelected] = useState<string>(); const source = slateDemoSources.find((item) => item.id === selected); return <main className="slate-plugin"><SlateStyles />{source ? <SourceDocument source={source} snapshot={slateDemoSnapshots[source.id]} onBack={() => setSelected(undefined)} /> : <><SourcePicker sources={slateDemoSources} onSelect={setSelected} /><p className="slate-plugin-demo">Preview data — native Workshop uses only your configured local files.</p></>}</main>; }
function SourcePicker({ sources, onSelect }: { sources: Source[]; onSelect: (id: string) => void }) { return <><header className="slate-plugin-header"><p>Slate · local reference desk</p><h1>Slate</h1></header><nav className="slate-plugin-sources" aria-label="Slate sources">{sources.map((source) => { const view = describeSlateView(source.view); return <button key={source.id} onClick={() => onSelect(source.id)}><span className="slate-plugin-source-glyph" aria-hidden="true">{view.glyph}</span><span className="slate-plugin-source-copy"><strong>{source.label}</strong><small>{view.description}</small></span></button>; })}</nav></>; }
function SourceDocument({ source, snapshot, onBack }: { source: Source; snapshot?: SlateSnapshot; onBack: () => void }) { return <><header className="slate-plugin-header"><p>Slate · local reference desk</p><h1>{source.label}</h1></header><button className="slate-plugin-back" onClick={onBack}>‹ Slate</button><div className="slate-plugin-panel-heading slate-plugin-panel-heading-meta"><LastEdited updatedAt={snapshot?.updatedAt} /></div><View source={source} snapshot={snapshot} /></>; }
function LastEdited({ updatedAt }: { updatedAt?: number }) { if (!updatedAt) return null; const date = new Date(updatedAt); return <time className="slate-plugin-last-edited" dateTime={date.toISOString()}><span aria-hidden="true">◷</span> Updated {date.toLocaleString()}</time>; }
function isBrowserPreview(): boolean { return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window); }
function View({ source, snapshot }: { source?: Source; snapshot?: SlateSnapshot }) { if (!source) return <p>Awaiting configured sources.</p>; if (!snapshot) return <p>Loading…</p>; if (source.view === "table") try { return <SortableTable contents={snapshot.contents} />; } catch { return <p role="alert">Slate could not render this table.</p>; } const sections = parseMarkdownSections(snapshot.contents); return source.view === "markdown-tabs" ? <Tabs sections={sections} /> : <Sections sections={sections} />; }
function SortableTable({ contents }: { contents: string }) { const table = parseMarkdownTable(contents); const [sort, setSort] = useState<{ column: number; direction: TableSortDirection }>(); const rows = sort ? sortTableRows(table.rows, sort.column, sort.direction) : table.rows; const toggleSort = (column: number) => setSort((current) => current?.column === column && current.direction === "ascending" ? { column, direction: "descending" } : { column, direction: "ascending" }); return <TooltipPrimitive.Provider delayDuration={350}><ScrollAreaPrimitive.Root className="slate-plugin-table"><ScrollAreaPrimitive.Viewport className="slate-plugin-table-viewport"><table><thead><tr>{table.headers.map((header, column) => { const direction = sort?.column === column ? sort.direction : "none"; const nextDirection = direction === "ascending" ? "descending" : "ascending"; return <th key={header} aria-sort={direction}><TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild><button aria-label={`Sort ${header} ${nextDirection}`} onClick={() => toggleSort(column)}>{header}<span aria-hidden="true">{direction === "ascending" ? " ↑" : direction === "descending" ? " ↓" : " ↕"}</span></button></TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content className="slate-plugin-tooltip" sideOffset={6}>Sort {header} {nextDirection}<TooltipPrimitive.Arrow className="slate-plugin-tooltip-arrow" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root></th>; })}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.join("-")}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex}><InlineMarkdown value={cell} /></td>)}</tr>)}</tbody></table></ScrollAreaPrimitive.Viewport><ScrollAreaPrimitive.Scrollbar className="slate-plugin-scrollbar" orientation="horizontal"><ScrollAreaPrimitive.Thumb className="slate-plugin-scrollbar-thumb" /></ScrollAreaPrimitive.Scrollbar></ScrollAreaPrimitive.Root></TooltipPrimitive.Provider>; }
function Tabs({ sections }: { sections: ReturnType<typeof parseMarkdownSections> }) { const tabs = buildTopLevelTabs(sections); if (!tabs.length) return <Sections sections={[]} />; return <TabsPrimitive.Root defaultValue={tabs[0].id}><TabsPrimitive.List className="slate-plugin-tabs" aria-label="Document sections">{tabs.map((item) => <TabsPrimitive.Trigger key={item.id} value={item.id}>{item.label}</TabsPrimitive.Trigger>)}</TabsPrimitive.List>{tabs.map((item) => <TabsPrimitive.Content key={item.id} value={item.id}><Sections sections={item.sections} /></TabsPrimitive.Content>)}</TabsPrimitive.Root>; }
function Sections({ sections }: { sections: ReturnType<typeof parseMarkdownSections> }) { return <div className="slate-plugin-content">{sections.map((section, index) => <section key={`${section.heading}-${index}`}><h2 className={section.level === 1 ? "slate-plugin-main-heading" : "slate-plugin-subheading"}><InlineMarkdown value={section.heading} /></h2>{section.paragraphs.map((paragraph, item) => <p key={item}><InlineMarkdown value={paragraph} /></p>)}{section.items.length ? <ul>{section.items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown value={item} /></li>)}</ul> : null}</section>)}</div>; }
function InlineMarkdown({ value }: { value: string }) { return <>{parseInlineMarkdown(value).map((token, index) => token.type === "strong" ? <strong key={index}>{token.value}</strong> : token.type === "link" ? <a key={index} href={token.href} rel="noreferrer" target="_blank">{token.label}</a> : <span key={index}>{token.value}</span>)}</>; }
function SlateStyles() { return <style>{`
  .slate-plugin{color:#f6f3f4;max-width:1040px;padding:4px 0 96px;font:14px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}
  .slate-plugin h1{font-size:32px;line-height:1.1;margin:2px 0 0;letter-spacing:-.03em}
  .slate-plugin-header{border-bottom:1px solid rgba(255,255,255,.12);padding:8px 0 13px}
  .slate-plugin-header p{color:#f81b8f;font-size:14px;font-weight:800;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em}
  .slate-plugin button{background:#171719;border:1px solid #454147;border-radius:7px;color:#f6f3f4;cursor:pointer;padding:7px 11px;font:inherit}
  .slate-plugin-sources{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 20px}
  .slate-plugin-sources button{align-items:center;background:rgba(255,255,255,.025);display:flex;flex:1 1 192px;gap:11px;min-width:0;padding:12px 13px;text-align:left}
  .slate-plugin-sources button:hover{background:rgba(248,27,143,.08);border-color:#f81b8f}
  .slate-plugin-source-glyph{color:#f81b8f;font-size:22px;line-height:1}
  .slate-plugin-source-copy{display:grid;gap:2px;min-width:0}
  .slate-plugin-source-copy strong{color:#f6f3f4;font-size:15px}
  .slate-plugin-source-copy small{color:#aaa7ab;font-size:12px}
  .slate-plugin-back{background:transparent!important;border:0!important;border-radius:0!important;color:#ffe500!important;margin:11px 0 0;padding:0!important}
  .slate-plugin-back:hover{color:#f6f3f4!important}
  .slate-plugin-panel-heading{align-items:center;display:flex;justify-content:space-between;gap:16px;margin-top:13px}
  .slate-plugin-panel-heading-meta{justify-content:flex-end}
  .slate-plugin-panel-heading p{color:#f6f3f4;font-size:14px;font-weight:700;margin:0}
  .slate-plugin-panel-heading span{color:#aaa7ab;font-size:12px}
  .slate-plugin-last-edited{align-items:center;color:#8e898f;display:flex;font-size:12px;gap:5px;white-space:nowrap}
  .slate-plugin-tabs{border-bottom:1px solid rgba(255,255,255,.16);display:flex;gap:4px;margin:14px 0 24px;overflow-x:auto;padding:0 3px}
  .slate-plugin-tabs button{background:transparent;border:1px solid transparent;border-bottom:0;border-radius:7px 7px 0 0;color:#aaa7ab;margin-bottom:-1px;padding:7px 11px;white-space:nowrap}
  .slate-plugin-tabs button:hover{color:#f6f3f4}
  .slate-plugin-tabs button[data-state=active]{background:#171719;border-color:rgba(255,255,255,.2);color:#ffe500;font-weight:700}
  .slate-plugin-tabs button:focus-visible{outline:2px solid #ffe500;outline-offset:3px}
  .slate-plugin-content{max-width:820px}
  .slate-plugin-panel-heading + .slate-plugin-content{margin-top:22px}
  .slate-plugin-content section{margin:0 0 20px}
  .slate-plugin-content h2{line-height:1.25;margin:0 0 6px;letter-spacing:-.03em}
  .slate-plugin-main-heading{color:#f81b8f;font-size:23px}
  .slate-plugin-subheading{color:#ffe500;font-size:17px}
  .slate-plugin-content p{color:#d1cdd1;margin:0 0 7px}
  .slate-plugin a{color:#ffe500;text-decoration-color:rgba(255,229,0,.55);text-underline-offset:2px}
  .slate-plugin a:hover{color:#f81b8f;text-decoration-color:#f81b8f}
  .slate-plugin-content ul{list-style:none;margin:5px 0 0;padding-left:18px}
  .slate-plugin-content li{margin:3px 0;position:relative}
  .slate-plugin-content ul li::before{color:#8e898f;content:"–";left:-15px;position:absolute}
  .slate-plugin-table{border:1px solid #403b42;border-radius:8px;margin-top:14px;overflow:hidden}
  .slate-plugin-table-viewport{overflow:auto}
  .slate-plugin table{border-collapse:collapse;width:100%;min-width:580px}
  .slate-plugin th,.slate-plugin td{padding:11px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.09);vertical-align:top}
  .slate-plugin th{color:#ffe500;background:#171719;font-size:11px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
  .slate-plugin tbody tr:hover{background:rgba(255,255,255,.035)}
  .slate-plugin th button{appearance:none;background:transparent;border:0;border-radius:0;color:inherit;cursor:pointer;font:inherit;padding:0}
  .slate-plugin-scrollbar{background:#171719;display:flex;height:8px;padding:2px}
  .slate-plugin-scrollbar-thumb{background:#6f6870;border-radius:99px;flex:1}
  .slate-plugin-tooltip{background:#f6f3f4;border-radius:5px;color:#16000d;font-size:12px;padding:5px 7px;z-index:100}
  .slate-plugin-tooltip-arrow{fill:#f6f3f4}
  .slate-plugin-error{color:#ff79b9}
  .slate-plugin-demo{color:#aaa7ab;font-size:12px;margin:14px 0 0}
`}</style>; }
