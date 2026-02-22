
/* Digital Rulebook – Catalogue Explorers (SVA / CVA / BMRS)
   - Single JS for consistent UX across pages.
   - Works on GitHub Pages (static fetch) with no build tooling.
*/

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function fetchJsonWithFallback(paths){
  let lastErr = null;
  for (const p of paths){
    try{
      const res = await fetch(p, {cache: "no-store"});
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${p}`);
      return await res.json();
    }catch(e){
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Failed to load JSON");
}

function stableString(v){
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function getSemanticType(rec){
  return rec?.smart_classification?.semantic_type
      ?? rec?.smart_classification?.semanticType
      ?? rec?.semantic_type
      ?? rec?.semanticType
      ?? "";
}

function getDomain(rec){
  return rec?.domain
      ?? rec?.smart_classification?.domain
      ?? rec?.data_domain
      ?? rec?.dataDomain
      ?? "";
}

function hasValidSet(rec){
  return Boolean(rec?.valid_set_name || rec?.valid_set_values || rec?.valid_set || rec?.validSet);
}

function boolish(v){
  return v === true || v === "true" || v === 1 || v === "1";
}

function computeCluster(rec){
  // Primary: semantic type if present
  const sem = (getSemanticType(rec) || "").toLowerCase();
  const name = (rec?.item_name || rec?.data_description || rec?.calculation_code || rec?.rule_id || "").toLowerCase();

  // SME-friendly canonical clusters
  if (sem.includes("identifier")) return "Identity";
  if (sem.includes("measurement")) return "Measurement";
  if (sem.includes("financial")) return "Financial";
  if (sem.includes("temporal")) return "Temporal";
  if (sem.includes("configuration") || sem.includes("constraint")) return "Config/Rules";
  if (sem.includes("descriptive")) return "Descriptive";

  // Heuristics fallback (for sparse semtypes)
  if (/(id|identifier|mpan|bmu|party|agent|serial|code)\b/.test(name)) return "Identity";
  if (/(price|charge|cash|cost|credit|invoice|settlement|£)\b/.test(name)) return "Financial";
  if (/(time|date|period|week|run|timestamp)\b/.test(name)) return "Temporal";
  if (/(flag|status|indicator|cert|accredit|rule|constraint|validation)\b/.test(name)) return "Config/Rules";
  if (/(volume|energy|mw|mwh|kwh|demand|forecast|meter)\b/.test(name)) return "Measurement";
  return "Other";
}

function normaliseRecords(config, raw){
  // config.extractRecords(raw) -> array of record objects with a minimal common surface
  return config.extractRecords(raw).map(r => ({
    __raw: r,
    __source: config.id,
    __cluster: computeCluster(r),
    __semantic: getSemanticType(r),
    __domain: getDomain(r),
    __computable: boolish(r?.smart_classification?.is_computable ?? r?.is_computable),
    __ontology: boolish(r?.smart_classification?.ontology_candidate ?? r?.ontology_candidate),
    __flow: Number(r?.data_flow_count ?? r?.smart_classification?.data_flow_count ?? r?.flow_count ?? r?.flowCount ?? 0) || 0,
    __hasValidSet: hasValidSet(r),
    __id: r?.item_reference || r?.item_id || r?.bmrs_code || r?.calculation_code || r?.rule_id || r?.id || "",
    __name: r?.item_name || r?.data_description || r?.expansion || r?.description || r?.title || "",
    ...r
  }));
}

function uniqueSorted(arr){
  return Array.from(new Set(arr.filter(x => x !== "" && x !== null && x !== undefined))).sort((a,b) => String(a).localeCompare(String(b)));
}

function fmtInt(n){ return (Number(n) || 0).toLocaleString("en-GB"); }

function setActiveNav(navId){
  $$(".pill").forEach(p => p.classList.toggle("active", p.dataset.nav === navId));
}

function buildOptions(selectEl, values, includeAllLabel="All"){
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = includeAllLabel;
  selectEl.appendChild(opt0);
  for (const v of values){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
}

function parseHash(){
  const h = (location.hash || "").replace(/^#/, "");
  const params = new URLSearchParams(h);
  const obj = {};
  for (const [k,v] of params.entries()) obj[k]=v;
  return obj;
}

function writeHash(state){
  const params = new URLSearchParams();
  Object.entries(state).forEach(([k,v]) => { if (v !== "" && v !== null && v !== undefined) params.set(k, String(v)); });
  const next = params.toString();
  history.replaceState(null, "", next ? `#${next}` : "#");
}

function pickColumns(config){
  // Common columns across explorers, configurable
  return config.columns ?? [
    {key:"__id", label:"Reference", mono:true},
    {key:"__name", label:"Name"},
    {key:"__cluster", label:"Cluster"},
    {key:"__semantic", label:"Semantic type"},
    {key:"__domain", label:"Domain"},
    {key:"__flow", label:"Flow count", mono:true},
    {key:"__computable", label:"Computable", mono:true},
    {key:"__ontology", label:"Ontology cand.", mono:true},
    {key:"__hasValidSet", label:"Valid set", mono:true},
  ];
}

function renderKpis(records){
  const total = records.length;
  const computable = records.filter(r => r.__computable).length;
  const ontology = records.filter(r => r.__ontology).length;
  const validSet = records.filter(r => r.__hasValidSet).length;

  $("#kpiTotal .num").textContent = fmtInt(total);
  $("#kpiComputable .num").textContent = fmtInt(computable);
  $("#kpiOntology .num").textContent = fmtInt(ontology);
  $("#kpiValidSet .num").textContent = fmtInt(validSet);
}

function renderTable(records, columns, state, onRowClick){
  const thead = $("#tbl thead");
  const tbody = $("#tbl tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  // Header
  const trh = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.dataset.key = col.key;
    if (state.sortKey === col.key) th.textContent += state.sortDir === "asc" ? " ▲" : " ▼";
    th.addEventListener("click", () => {
      const nextDir = (state.sortKey === col.key && state.sortDir === "asc") ? "desc" : "asc";
      state.sortKey = col.key;
      state.sortDir = nextDir;
      applyState(state, true);
    });
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  // Rows
  for (const r of records){
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.addEventListener("click", () => onRowClick(r));
    tr.addEventListener("keypress", (e) => { if (e.key === "Enter") onRowClick(r); });
    columns.forEach(col => {
      const td = document.createElement("td");
      const val = r[col.key];
      const out = (typeof val === "boolean") ? (val ? "true" : "false") : (val ?? "");
      td.innerHTML = `<span class="${col.mono ? "mono": ""}">${escapeHtml(out)}</span>`;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

function showModal(record, config){
  $("#modalTitle").textContent = record.__name || record.__id || "Item";
  const desc = config.describeRecord(record);
  $("#modalMeta").innerHTML = desc;
  $("#modalJson").textContent = JSON.stringify(record.__raw, null, 2);
  $("#modalBack").style.display = "flex";
}

function hideModal(){
  $("#modalBack").style.display = "none";
}

function filterRecords(all, state){
  const q = (state.q || "").toLowerCase().trim();
  const cluster = state.cluster || "";
  const domain = state.domain || "";
  const semantic = state.semantic || "";
  const minFlow = Number(state.minFlow || 0) || 0;
  const onlyComputable = state.onlyComputable === "1";
  const onlyOntology = state.onlyOntology === "1";
  const onlyValidSet = state.onlyValidSet === "1";

  let out = all;

  if (q){
    out = out.filter(r => {
      const blob = `${r.__id} ${r.__name} ${stableString(r.notes)} ${stableString(r.description)} ${stableString(r.data_description)} ${stableString(r.defined_in)} ${stableString(r.bsc_section)} ${stableString(r.bmrs_code)}`.toLowerCase();
      return blob.includes(q);
    });
  }
  if (cluster) out = out.filter(r => r.__cluster === cluster);
  if (domain) out = out.filter(r => (r.__domain || "") === domain);
  if (semantic) out = out.filter(r => (r.__semantic || "") === semantic);
  if (minFlow > 0) out = out.filter(r => (r.__flow || 0) >= minFlow);
  if (onlyComputable) out = out.filter(r => r.__computable);
  if (onlyOntology) out = out.filter(r => r.__ontology);
  if (onlyValidSet) out = out.filter(r => r.__hasValidSet);

  // sorting
  const key = state.sortKey || "__id";
  const dir = state.sortDir || "asc";
  const mul = dir === "asc" ? 1 : -1;
  out = out.slice().sort((a,b) => {
    const av = a[key]; const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av ?? "").localeCompare(String(bv ?? ""), "en-GB") * mul;
  });

  return out;
}

let __CONFIG = null;
let __RAW = null;
let __ALL = [];
let __STATE = {};

function readControlsIntoState(state){
  state.q = $("#q").value || "";
  state.cluster = $("#cluster").value || "";
  state.domain = $("#domain").value || "";
  state.semantic = $("#semantic").value || "";
  state.minFlow = $("#minFlow").value || "0";
  state.onlyComputable = $("#onlyComputable").checked ? "1" : "";
  state.onlyOntology = $("#onlyOntology").checked ? "1" : "";
  state.onlyValidSet = $("#onlyValidSet").checked ? "1" : "";
}

function writeStateToControls(state){
  $("#q").value = state.q || "";
  $("#cluster").value = state.cluster || "";
  $("#domain").value = state.domain || "";
  $("#semantic").value = state.semantic || "";
  $("#minFlow").value = state.minFlow || "0";
  $("#onlyComputable").checked = state.onlyComputable === "1";
  $("#onlyOntology").checked = state.onlyOntology === "1";
  $("#onlyValidSet").checked = state.onlyValidSet === "1";
}

function applyState(state, fromClick=false){
  // persist hash for shareability
  if (fromClick) readControlsIntoState(state);
  writeHash({
    q: state.q || "",
    cluster: state.cluster || "",
    domain: state.domain || "",
    semantic: state.semantic || "",
    minFlow: state.minFlow || "0",
    onlyComputable: state.onlyComputable || "",
    onlyOntology: state.onlyOntology || "",
    onlyValidSet: state.onlyValidSet || "",
    sortKey: state.sortKey || "__id",
    sortDir: state.sortDir || "asc"
  });

  const filtered = filterRecords(__ALL, state);
  $("#resultCount").textContent = `${fmtInt(filtered.length)} items`;
  renderKpis(filtered);

  const cols = pickColumns(__CONFIG);
  renderTable(filtered, cols, state, (r) => showModal(r, __CONFIG));
}

function wireControls(state){
  const onChange = () => applyState(state, true);

  $("#q").addEventListener("input", () => onChange());
  ["cluster","domain","semantic","minFlow"].forEach(id => $("#"+id).addEventListener("change", () => onChange()));
  ["onlyComputable","onlyOntology","onlyValidSet"].forEach(id => $("#"+id).addEventListener("change", () => onChange()));

  $("#reset").addEventListener("click", () => {
    Object.assign(state, {q:"", cluster:"", domain:"", semantic:"", minFlow:"0", onlyComputable:"", onlyOntology:"", onlyValidSet:"", sortKey:"__id", sortDir:"asc"});
    writeStateToControls(state);
    applyState(state, true);
  });

  $("#modalClose").addEventListener("click", hideModal);
  $("#modalBack").addEventListener("click", (e) => { if (e.target.id === "modalBack") hideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideModal(); });
}

function renderHeader(config){
  $("#pageTitle").textContent = config.title;
  $("#pageSubtitle").textContent = config.subtitle;
  $("#metaDoc").textContent = config.metaDocLine;
  setActiveNav(config.id);
}

function summariseMeta(raw){
  const m = raw?.metadata || {};
  const stats = m?.statistics || {};
  const bits = [];
  if (m.document_title) bits.push(m.document_title);
  if (m.version) bits.push(`v${m.version}`);
  if (m.status) bits.push(m.status);
  if (m.effective_from_date) bits.push(`effective ${m.effective_from_date}`);
  if (stats.total_data_items) bits.push(`${fmtInt(stats.total_data_items)} items`);
  return bits.join(" · ");
}

export async function initExplorer(config){
  __CONFIG = config;
  renderHeader(config);

  const raw = await fetchJsonWithFallback(config.dataPaths);
  __RAW = raw;
  __ALL = normaliseRecords(config, raw);

  // Build facets
  const clusters = uniqueSorted(__ALL.map(r => r.__cluster));
  const domains = uniqueSorted(__ALL.map(r => r.__domain));
  const sems = uniqueSorted(__ALL.map(r => r.__semantic));

  buildOptions($("#cluster"), clusters, "All clusters");
  buildOptions($("#domain"), domains, "All domains");
  buildOptions($("#semantic"), sems, "All semantic types");

  // hydrate from hash if present
  const h = parseHash();
  __STATE = {
    q: h.q || "",
    cluster: h.cluster || "",
    domain: h.domain || "",
    semantic: h.semantic || "",
    minFlow: h.minFlow || "0",
    onlyComputable: h.onlyComputable || "",
    onlyOntology: h.onlyOntology || "",
    onlyValidSet: h.onlyValidSet || "",
    sortKey: h.sortKey || "__id",
    sortDir: h.sortDir || "asc"
  };
  writeStateToControls(__STATE);
  $("#metaDoc").textContent = summariseMeta(raw) || config.metaDocLine || "";

  wireControls(__STATE);
  applyState(__STATE, false);
}
