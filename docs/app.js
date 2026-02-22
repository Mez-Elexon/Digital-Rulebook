(() => {
  const DATA_URL = "./data/bmrs_data_catalogue.json";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    tab: "overview",
    q: "",
    sort: "bmrs_code",
    dir: "asc",
    facets: {
      table: new Set(),
      semantic_type: new Set(),
      data_provider: new Set(),
      frequency: new Set(),
      temporal_scope: new Set(),
      granularity: new Set(),
      ontology_candidate: new Set()
    },
    selected: null,
    page: 1,
    pageSize: 25
  };

  let raw = null;
  let reporting = [];
  let calculated = [];
  let requirements = {};
  let meta = {};
  let stats = {};

  function tagClassForStatus(status){
    const u = String(status || "").toUpperCase();
    if (u === "LIVE") return ["good","LIVE"];
    if (u === "DRAFT") return ["warn","DRAFT"];
    if (u === "SUPERSEDED") return ["bad","SUPERSEDED"];
    return ["warn", u || "UNKNOWN"];
  }

  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function fmtDate(iso){
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toISOString().slice(0,10);
  }

  function normaliseReportingItem(x){
    const sc = x.smart_classification || {};
    return {
      ...x,
      _table: String(x.table ?? ""),
      _semantic_type: String(sc.semantic_type ?? ""),
      _data_provider: String(sc.data_provider ?? ""),
      _ontology_candidate: String(sc.ontology_candidate ?? ""),
      _frequency: String(x.frequency ?? ""),
      _temporal_scope: String(x.temporal_scope ?? ""),
      _granularity: String(x.granularity ?? ""),
      _section_refs: Array.isArray(sc.bsc_section_references) ? sc.bsc_section_references : [],
      _haystack: [
        x.bmrs_code, x.data_description, x.frequency, x.format, x.default,
        x.temporal_scope, x.granularity, x.table,
        sc.semantic_type, sc.data_provider,
        ...(sc.bsc_section_references || []),
        ...(sc.related_bmrs_codes || [])
      ].filter(Boolean).join(" | ").toLowerCase()
    };
  }

  function parseHash(){
    // Format: #/tab?key=value&key=value
    const h = location.hash || "#/overview";
    const [path, query] = h.replace(/^#/, "").split("?");
    const tab = (path || "/overview").replace(/^\//,"") || "overview";
    const params = new URLSearchParams(query || "");
    return { tab, params };
  }

  function syncTabs(){
    const { tab } = parseHash();
    $$(".tab").forEach(a => a.classList.toggle("active", a.dataset.tab === tab));
  }

  function setFacetFromParams(params, key){
    const v = params.get(key);
    state.facets[key].clear();
    if (!v) return;
    v.split(",").map(s => s.trim()).filter(Boolean).forEach(x => state.facets[key].add(x));
  }

  function loadStateFromUrl(){
    const { tab, params } = parseHash();
    state.tab = tab;

    state.q = params.get("q") || "";
    state.sort = params.get("sort") || (tab === "calculated" ? "calculation_code" : "bmrs_code");
    state.dir = params.get("dir") || "asc";
    state.page = Math.max(1, parseInt(params.get("page") || "1", 10));
    state.pageSize = Math.max(10, parseInt(params.get("ps") || "25", 10));
    state.selected = params.get("sel") || null;

    if (tab === "reporting"){
      ["table","semantic_type","data_provider","frequency","temporal_scope","granularity","ontology_candidate"].forEach(k => setFacetFromParams(params, k));
    }
  }

  function writeStateToUrl({ replace = true } = {}){
    const params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.sort) params.set("sort", state.sort);
    if (state.dir) params.set("dir", state.dir);
    if (state.page && state.page !== 1) params.set("page", String(state.page));
    if (state.pageSize && state.pageSize !== 25) params.set("ps", String(state.pageSize));
    if (state.selected) params.set("sel", state.selected);

    if (state.tab === "reporting"){
      for (const [k, set] of Object.entries(state.facets)){
        if (!set || set.size === 0) continue;
        params.set(k, Array.from(set).join(","));
      }
    }

    const next = `#/${state.tab}${params.toString() ? "?" + params.toString() : ""}`;
    if (replace) history.replaceState(null, "", next);
    else location.hash = next;
  }

  function computeCounts(items, getter){
    const m = new Map();
    for (const it of items){
      const v = getter(it);
      if (v === "" || v == null) continue;
      const key = String(v);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  }

  function facetBlock(title, key, counts){
    const selected = state.facets[key];
    const rows = counts.map(([val, n]) => {
      const id = `${key}__${val}`.replace(/[^a-zA-Z0-9_]/g, "_");
      const checked = selected.has(val) ? "checked" : "";
      return `
        <label class="facetItem" for="${esc(id)}">
          <span class="facetLeft">
            <input type="checkbox" id="${esc(id)}" data-facet="${esc(key)}" value="${esc(val)}" ${checked} />
            <span>${esc(val)}</span>
          </span>
          <span class="count">${n}</span>
        </label>
      `;
    }).join("");

    return `
      <div class="facetGroup">
        <div class="facetTitle">${esc(title)}</div>
        <div>${rows || `<div class="muted small">No values</div>`}</div>
      </div>
    `;
  }

  function matchFacets(it){
    for (const [k, set] of Object.entries(state.facets)){
      if (!set || set.size === 0) continue;
      const v = it[`_${k}`];
      if (!set.has(String(v))) return false;
    }
    return true;
  }

  function filterReporting(){
    const q = state.q.trim().toLowerCase();
    let items = reporting;

    if (q) items = items.filter(it => it._haystack.includes(q));
    items = items.filter(matchFacets);

    return items;
  }

  function sortItems(items, key, dir){
    const d = dir === "desc" ? -1 : 1;
    const get = (x) => (x[key] ?? x[`_${key}`] ?? "");
    return items.slice().sort((a,b) => {
      const av = String(get(a));
      const bv = String(get(b));
      return d * av.localeCompare(bv, undefined, { numeric:true, sensitivity:"base" });
    });
  }

  function paginate(items){
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;
    return { total, pages, slice: items.slice(start, end) };
  }

  function pager(total, pages){
    const prevDisabled = state.page <= 1 ? "disabled" : "";
    const nextDisabled = state.page >= pages ? "disabled" : "";
    return `
      <div class="controls" style="justify-content:space-between; margin-top:10px">
        <div class="muted small">${total} items • page ${state.page} / ${pages}</div>
        <div class="controls">
          <button class="btn secondary" data-pager="prev" ${prevDisabled}>Prev</button>
          <button class="btn secondary" data-pager="next" ${nextDisabled}>Next</button>
          <select class="select" id="pageSizeSel" title="Page size">
            ${[25,50,100].map(n => `<option value="${n}" ${n===state.pageSize?"selected":""}>${n}/page</option>`).join("")}
          </select>
        </div>
      </div>
    `;
  }

  function reportingTable(items){
    const rows = items.map(it => {
      const oc = String(it._ontology_candidate).toLowerCase() === "true";
      const pill = oc ? `<span class="pill good">Ontology</span>` : `<span class="pill">—</span>`;
      return `
        <tr class="rowLink" data-select="${esc(it.bmrs_code)}">
          <td class="mono">${esc(it.bmrs_code)}</td>
          <td>${esc(it.data_description || "")}</td>
          <td>${esc(it._table || "—")}</td>
          <td>${esc(it._semantic_type || "—")}</td>
          <td>${esc(it._data_provider || "—")}</td>
          <td>${pill}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th data-sort="bmrs_code">BMRS code</th>
              <th data-sort="data_description">Description</th>
              <th data-sort="_table">Table</th>
              <th data-sort="_semantic_type">Semantic type</th>
              <th data-sort="_data_provider">Provider</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6" class="muted">No results. Try clearing filters.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function reportingDetail(it){
    if (!it){
      return `
        <div class="card">
          <div class="cardHd">
            <div class="cardTitle">Details</div>
            <div class="badge warn">Nothing selected</div>
          </div>
          <div class="cardBd">
            <div class="muted">Select a row to see the full record. Use “Copy link” to share a direct deep link.</div>
          </div>
        </div>
      `;
    }

    const sc = it.smart_classification || {};
    const oc = String(sc.ontology_candidate).toLowerCase() === "true";
    const badge = oc ? `<span class="badge good">Ontology candidate</span>` : `<span class="badge">Not flagged</span>`;
    const sec = Array.isArray(sc.bsc_section_references) ? sc.bsc_section_references : [];
    const rel = Array.isArray(sc.related_bmrs_codes) ? sc.related_bmrs_codes : [];

    return `
      <div class="card">
        <div class="cardHd">
          <div class="cardTitle"><span class="mono">${esc(it.bmrs_code)}</span></div>
          ${badge}
        </div>
        <div class="cardBd">
          <div class="detailRow"><div class="detailKey">Description</div><div class="detailVal">${esc(it.data_description || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Table</div><div class="detailVal">${esc(it.table ?? "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Frequency</div><div class="detailVal">${esc(it.frequency || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Temporal scope</div><div class="detailVal">${esc(it.temporal_scope || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Granularity</div><div class="detailVal">${esc(it.granularity || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Format</div><div class="detailVal">${esc(it.format || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Default</div><div class="detailVal">${esc(it.default || "—")}</div></div>

          <div class="hr"></div>

          <div class="detailRow"><div class="detailKey">Semantic type</div><div class="detailVal">${esc(sc.semantic_type || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Data provider</div><div class="detailVal">${esc(sc.data_provider || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Computable</div><div class="detailVal">${esc(sc.is_computable ?? "—")}</div></div>
          <div class="detailRow"><div class="detailKey">BSC refs</div><div class="detailVal">${sec.length ? sec.map(x=>`<span class="pill">${esc(x)}</span>`).join(" ") : "—"}</div></div>
          <div class="detailRow"><div class="detailKey">Related codes</div><div class="detailVal">${rel.length ? rel.map(x=>`<span class="pill">${esc(x)}</span>`).join(" ") : "—"}</div></div>

          <div class="hr"></div>

          <div class="controls">
            <button class="btn secondary" id="copyItemBtn">Copy item JSON</button>
            <button class="btn secondary" id="copyCodeBtn">Copy code</button>
          </div>

          <div style="margin-top:10px">
            <div class="muted small" style="margin-bottom:6px">Raw JSON</div>
            <pre>${esc(JSON.stringify(it, null, 2))}</pre>
          </div>
        </div>
      </div>
    `;
  }

  function reportingView(){
    const filtered = filterReporting();
    const sorted = sortItems(filtered, state.sort, state.dir);
    const { total, pages, slice } = paginate(sorted);

    // facet counts are computed from filtered-by-search (q) but NOT filtered-by-facets? We do after q only for better UX.
    const q = state.q.trim().toLowerCase();
    const base = q ? reporting.filter(it => it._haystack.includes(q)) : reporting;

    const facetsHtml = [
      facetBlock("Table", "table", computeCounts(base, it => it._table)),
      facetBlock("Semantic type", "semantic_type", computeCounts(base, it => it._semantic_type)),
      facetBlock("Provider", "data_provider", computeCounts(base, it => it._data_provider)),
      facetBlock("Frequency", "frequency", computeCounts(base, it => it._frequency)),
      facetBlock("Temporal scope", "temporal_scope", computeCounts(base, it => it._temporal_scope)),
      facetBlock("Granularity", "granularity", computeCounts(base, it => it._granularity)),
      facetBlock("Ontology candidate", "ontology_candidate", computeCounts(base, it => it._ontology_candidate))
    ].join("");

    const selectedItem = state.selected
      ? reporting.find(x => x.bmrs_code === state.selected)
      : null;

    return `
      <div class="grid">
        <div class="card">
          <div class="cardHd">
            <div class="cardTitle">Filters</div>
            <button class="btn secondary" id="clearFiltersBtn">Clear</button>
          </div>
          <div class="cardBd">
            <div class="facetTitle">Search</div>
            <input class="input" id="searchInput" placeholder="Search codes, descriptions, sections, providers…" value="${esc(state.q)}" />
            <div class="hr"></div>
            ${facetsHtml}
          </div>
        </div>

        <div class="card">
          <div class="cardHd">
            <div class="cardTitle">Reporting items</div>
            <div class="controls">
              <select class="select" id="sortSel" title="Sort">
                ${[
                  ["bmrs_code","BMRS code"],
                  ["data_description","Description"],
                  ["_table","Table"],
                  ["_semantic_type","Semantic type"],
                  ["_data_provider","Provider"]
                ].map(([k,l]) => `<option value="${k}" ${k===state.sort?"selected":""}>Sort: ${l}</option>`).join("")}
              </select>
              <select class="select" id="dirSel" title="Direction">
                <option value="asc" ${state.dir==="asc"?"selected":""}>Asc</option>
                <option value="desc" ${state.dir==="desc"?"selected":""}>Desc</option>
              </select>
            </div>
          </div>
          <div class="cardBd">
            ${reportingTable(slice)}
            ${pager(total, pages)}
          </div>
        </div>

        <div id="detailPane">
          ${reportingDetail(selectedItem)}
        </div>
      </div>
    `;
  }

  function calculatedView(){
    const q = state.q.trim().toLowerCase();
    let items = calculated;
    if (q){
      items = items.filter(it => JSON.stringify(it).toLowerCase().includes(q));
    }
    items = sortItems(items, state.sort || "calculation_code", state.dir || "asc");
    const { total, pages, slice } = paginate(items);

    const rows = slice.map(it => {
      const oc = String(it.ontology_candidate).toLowerCase() === "true";
      const pill = oc ? `<span class="pill good">Ontology</span>` : `<span class="pill">—</span>`;
      const ind = it.is_indicative ? `<span class="pill warn">Indicative</span>` : `<span class="pill">—</span>`;
      return `
        <tr class="rowLink" data-select="${esc(it.calculation_code)}">
          <td class="mono">${esc(it.calculation_code)}</td>
          <td>${esc(it.expansion || "")}</td>
          <td>${esc(it.bsc_section || "—")}</td>
          <td>${ind}</td>
          <td>${pill}</td>
        </tr>
      `;
    }).join("");

    const selected = state.selected
      ? calculated.find(x => x.calculation_code === state.selected)
      : null;

    const detail = selected ? `
      <div class="card">
        <div class="cardHd">
          <div class="cardTitle"><span class="mono">${esc(selected.calculation_code)}</span></div>
          <div class="badge ${String(selected.ontology_candidate).toLowerCase()==="true" ? "good":"warn"}">${String(selected.ontology_candidate).toLowerCase()==="true" ? "Ontology candidate" : "Not flagged"}</div>
        </div>
        <div class="cardBd">
          <div class="detailRow"><div class="detailKey">Expansion</div><div class="detailVal">${esc(selected.expansion || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">BSC section</div><div class="detailVal">${esc(selected.bsc_section || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Indicative</div><div class="detailVal">${esc(selected.is_indicative ?? "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Semantic type</div><div class="detailVal">${esc(selected.semantic_type || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Derives from</div><div class="detailVal">${Array.isArray(selected.derives_from) ? selected.derives_from.map(x=>`<span class="pill">${esc(x)}</span>`).join(" ") : "—"}</div></div>

          <div class="hr"></div>

          <div class="controls">
            <button class="btn secondary" id="copyCalcBtn">Copy item JSON</button>
          </div>

          <div style="margin-top:10px">
            <div class="muted small" style="margin-bottom:6px">Raw JSON</div>
            <pre>${esc(JSON.stringify(selected, null, 2))}</pre>
          </div>
        </div>
      </div>
    ` : reportingDetail(null).replace("Details", "Details");

    return `
      <div class="grid">
        <div class="card">
          <div class="cardHd">
            <div class="cardTitle">Search</div>
            <span class="badge warn">Calculated</span>
          </div>
          <div class="cardBd">
            <input class="input" id="searchInput" placeholder="Search calculated items…" value="${esc(state.q)}" />
            <div class="hr"></div>
            <div class="muted small">Search matches across the whole item record (expansion, section, derives_from).</div>
          </div>
        </div>

        <div class="card">
          <div class="cardHd">
            <div class="cardTitle">Calculated items</div>
            <div class="controls">
              <select class="select" id="sortSel" title="Sort">
                ${[
                  ["calculation_code","Calculation code"],
                  ["bsc_section","BSC section"],
                  ["semantic_type","Semantic type"]
                ].map(([k,l]) => `<option value="${k}" ${k===state.sort?"selected":""}>Sort: ${l}</option>`).join("")}
              </select>
              <select class="select" id="dirSel" title="Direction">
                <option value="asc" ${state.dir==="asc"?"selected":""}>Asc</option>
                <option value="desc" ${state.dir==="desc"?"selected":""}>Desc</option>
              </select>
            </div>
          </div>
          <div class="cardBd">
            <div class="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Expansion</th>
                    <th>Section</th>
                    <th>Indicative</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || `<tr><td colspan="5" class="muted">No results.</td></tr>`}
                </tbody>
              </table>
            </div>
            ${pager(total, pages)}
          </div>
        </div>

        <div id="detailPane">${detail}</div>
      </div>
    `;
  }

  function requirementsView(){
    const cats = Object.keys(requirements || {});
    const q = state.q.trim().toLowerCase();

    const blocks = cats.map(cat => {
      const items = requirements[cat] || [];
      const filtered = q ? items.filter(x => JSON.stringify(x).toLowerCase().includes(q)) : items;
      const rows = filtered.map((x, i) => {
        const title = x.title || x.requirement || `Requirement ${i+1}`;
        const ref = x.bsc_section_reference || x.section || "";
        return `
          <div class="card" style="margin-top:10px">
            <div class="cardHd">
              <div class="cardTitle">${esc(title)}</div>
              <span class="badge">${esc(ref || "—")}</span>
            </div>
            <div class="cardBd">
              <pre>${esc(JSON.stringify(x, null, 2))}</pre>
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="card" style="margin-bottom:12px">
          <div class="cardHd">
            <div class="cardTitle">${esc(cat.replace(/_/g," "))}</div>
            <span class="badge warn">${items.length} item(s)</span>
          </div>
          <div class="cardBd">
            ${rows || `<div class="muted">No matches in this category.</div>`}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="grid">
        <div class="card">
          <div class="cardHd">
            <div class="cardTitle">Search</div>
            <span class="badge warn">Requirements</span>
          </div>
          <div class="cardBd">
            <input class="input" id="searchInput" placeholder="Search requirement records…" value="${esc(state.q)}" />
            <div class="hr"></div>
            <div class="muted small">Requirements are grouped by category. Each entry is currently shown as raw JSON for transparency.</div>
          </div>
        </div>

        <div class="card" style="grid-column: span 2">
          <div class="cardHd">
            <div class="cardTitle">Functional requirements</div>
            <span class="badge">${cats.length} categories</span>
          </div>
          <div class="cardBd">
            ${blocks || `<div class="muted">No requirement categories found.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function topN(counts, n=8){
    return counts.slice(0,n);
  }

  function chart(title, counts){
    const max = Math.max(1, ...counts.map(([,v]) => v));
    const rows = counts.map(([k,v]) => {
      const w = Math.round((v / max) * 100);
      return `
        <div class="bar">
          <div style="width:140px" class="small">${esc(k)}</div>
          <div class="barTrack" title="${v}">
            <div class="barFill" style="width:${w}%"></div>
          </div>
          <div style="width:40px; text-align:right" class="muted small">${v}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="chart">
        <div class="facetTitle">${esc(title)}</div>
        ${rows || `<div class="muted small">No data</div>`}
      </div>
    `;
  }

  function overviewView(){
    const [scls, stext] = tagClassForStatus(meta.status);
    const rN = stats.total_reporting_items ?? reporting.length;
    const cN = stats.calculated_data_items ?? calculated.length;
    const fN = stats.functional_rules_extracted ?? Object.values(requirements || {}).reduce((a,b)=>a+(b?.length||0),0);

    const byTable = topN(computeCounts(reporting, it => it._table), 10);
    const byType = topN(computeCounts(reporting, it => it._semantic_type), 10);
    const byProv = topN(computeCounts(reporting, it => it._data_provider), 10);

    return `
      <div class="card">
        <div class="cardHd">
          <div class="cardTitle">Catalogue overview</div>
          <div class="badge ${scls}">${esc(stext)} • SMART L${esc(meta.smart_level ?? "—")}</div>
        </div>
        <div class="cardBd">
          <div class="kpiRow">
            <div class="kpi"><div class="n">${esc(rN)}</div><div class="l">Reporting items</div></div>
            <div class="kpi"><div class="n">${esc(cN)}</div><div class="l">Calculated items</div></div>
            <div class="kpi"><div class="n">${esc(fN)}</div><div class="l">Functional requirement records</div></div>
            <div class="kpi"><div class="n">${esc(meta.version ?? "—")}</div><div class="l">Version</div></div>
          </div>

          <div class="hr"></div>

          <div class="detailRow"><div class="detailKey">Title</div><div class="detailVal">${esc(meta.document_title || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Reference</div><div class="detailVal">${esc(meta.document_reference || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">Effective from</div><div class="detailVal"><span class="mono">${esc(fmtDate(meta.effective_from_date))}</span></div></div>
          <div class="detailRow"><div class="detailKey">BSC reference</div><div class="detailVal">${esc(meta.bsc_section_reference || "—")}</div></div>
          <div class="detailRow"><div class="detailKey">SMART notes</div><div class="detailVal">${esc(meta.smart_level_notes || "—")}</div></div>

          <div class="hr"></div>

          <div class="chartRow">
            ${chart("Reporting items by table", byTable)}
            ${chart("Reporting items by semantic type", byType)}
            ${chart("Reporting items by provider", byProv)}
          </div>

          <div class="hr"></div>

          <div class="controls">
            <a class="btn" href="#/reporting">Explore reporting items</a>
            <a class="btn secondary" href="#/calculated">Explore calculated items</a>
            <a class="btn secondary" href="#/requirements">Explore requirements</a>
          </div>
        </div>
      </div>
    `;
  }

  function aboutView(){
    return `
      <div class="card">
        <div class="cardHd">
          <div class="cardTitle">About this explorer</div>
          <span class="badge">Static</span>
        </div>
        <div class="cardBd">
          <div class="muted">
            This is a single-page, client-side viewer designed for GitHub Pages.
            It reads the catalogue JSON at runtime and provides:
          </div>
          <div class="hr"></div>
          <ul>
            <li>Faceted navigation over reporting items (table, semantic type, provider, etc.)</li>
            <li>Full-text search across codes, descriptions, section refs and related codes</li>
            <li>Deep links: filters + selection persist in the URL</li>
            <li>Copy-to-clipboard for links and selected item JSON</li>
          </ul>

          <div class="hr"></div>

          <div class="detailRow"><div class="detailKey">Data file</div><div class="detailVal"><a href="./data/bmrs_data_catalogue.json"><span class="mono">data/bmrs_data_catalogue.json</span></a></div></div>
          <div class="detailRow"><div class="detailKey">Schema file</div><div class="detailVal"><a href="./schemas/bmrs_schema.json"><span class="mono">schemas/bmrs_schema.json</span></a></div></div>

          <div class="hr"></div>

          <div class="muted small">
            If you later want this to support CVA/SVA too, you can generalise the normaliser + facet config and add a dataset selector.
          </div>
        </div>
      </div>
    `;
  }

  function render(){
    syncTabs();

    const app = $("#app");
    if (!raw){
      app.innerHTML = `
        <div class="card">
          <div class="cardHd">
            <div class="cardTitle">Loading…</div>
            <div class="badge warn">Fetching catalogue</div>
          </div>
          <div class="cardBd">
            <div class="muted">Attempting to fetch <span class="mono">${esc(DATA_URL)}</span></div>
          </div>
        </div>
      `;
      return;
    }

    if (state.tab === "reporting") app.innerHTML = reportingView();
    else if (state.tab === "calculated") app.innerHTML = calculatedView();
    else if (state.tab === "requirements") app.innerHTML = requirementsView();
    else if (state.tab === "about") app.innerHTML = aboutView();
    else app.innerHTML = overviewView();

    wireEvents();
  }

  function clearReportingFacets(){
    Object.values(state.facets).forEach(s => s.clear());
  }

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    }catch{
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Copied to clipboard");
    }
  }

  function toast(msg){
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.bottom = "16px";
    el.style.right = "16px";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "14px";
    el.style.border = "1px solid var(--border)";
    el.style.background = "rgba(0,0,0,.55)";
    el.style.color = "var(--text)";
    el.style.boxShadow = "var(--shadow)";
    el.style.zIndex = 9999;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  function wireEvents(){
    const search = $("#searchInput");
    if (search){
      search.addEventListener("input", (e) => {
        state.q = e.target.value;
        state.page = 1;
        writeStateToUrl();
        render();
      });
    }

    const clearBtn = $("#clearFiltersBtn");
    if (clearBtn){
      clearBtn.addEventListener("click", () => {
        state.q = "";
        clearReportingFacets();
        state.page = 1;
        state.selected = null;
        writeStateToUrl();
        render();
      });
    }

    const sortSel = $("#sortSel");
    if (sortSel){
      sortSel.addEventListener("change", (e) => {
        state.sort = e.target.value;
        state.page = 1;
        writeStateToUrl();
        render();
      });
    }

    const dirSel = $("#dirSel");
    if (dirSel){
      dirSel.addEventListener("change", (e) => {
        state.dir = e.target.value;
        state.page = 1;
        writeStateToUrl();
        render();
      });
    }

    const pageSizeSel = $("#pageSizeSel");
    if (pageSizeSel){
      pageSizeSel.addEventListener("change", (e) => {
        state.pageSize = parseInt(e.target.value, 10);
        state.page = 1;
        writeStateToUrl();
        render();
      });
    }

    $$("input[type=checkbox][data-facet]").forEach(cb => {
      cb.addEventListener("change", (e) => {
        const key = e.target.dataset.facet;
        const val = e.target.value;
        if (e.target.checked) state.facets[key].add(val);
        else state.facets[key].delete(val);
        state.page = 1;
        writeStateToUrl();
        render();
      });
    });

    $$("th[data-sort]").forEach(th => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sort === key) state.dir = state.dir === "asc" ? "desc" : "asc";
        else { state.sort = key; state.dir = "asc"; }
        state.page = 1;
        writeStateToUrl();
        render();
      });
    });

    $$("tr.rowLink[data-select]").forEach(tr => {
      tr.addEventListener("click", () => {
        state.selected = tr.dataset.select;
        writeStateToUrl();
        render();
      });
    });

    $$("button[data-pager]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.dataset.pager === "prev") state.page = Math.max(1, state.page - 1);
        if (btn.dataset.pager === "next") state.page = state.page + 1;
        writeStateToUrl();
        render();
      });
    });

    const copyItemBtn = $("#copyItemBtn");
    if (copyItemBtn){
      copyItemBtn.addEventListener("click", async () => {
        const it = reporting.find(x => x.bmrs_code === state.selected);
        if (it) await copyText(JSON.stringify(it, null, 2));
      });
    }
    const copyCodeBtn = $("#copyCodeBtn");
    if (copyCodeBtn){
      copyCodeBtn.addEventListener("click", async () => {
        if (state.selected) await copyText(state.selected);
      });
    }

    const copyCalcBtn = $("#copyCalcBtn");
    if (copyCalcBtn){
      copyCalcBtn.addEventListener("click", async () => {
        const it = calculated.find(x => x.calculation_code === state.selected);
        if (it) await copyText(JSON.stringify(it, null, 2));
      });
    }
  }

  async function init(){
    syncTabs();
    $("#copyLinkBtn")?.addEventListener("click", () => copyText(location.href));

    try{
      const r = await fetch(DATA_URL, { cache:"no-store" });
      if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
      raw = await r.json();

      meta = raw.metadata || {};
      stats = meta.statistics || {};
      reporting = (raw.reporting_items || []).map(normaliseReportingItem);
      calculated = raw.calculated_data_items || [];
      requirements = raw.functional_requirements || {};

      $("#loadBadge")?.classList.add("good");
      $("#loadBadge") && ($("#loadBadge").textContent = "Loaded");

      loadStateFromUrl();
      render();
    }catch(e){
      const app = $("#app");
      app.innerHTML = `
        <div class="card">
          <div class="cardHd">
            <div class="cardTitle">Failed to load data</div>
            <div class="badge bad">Error</div>
          </div>
          <div class="cardBd">
            <div class="muted">Could not fetch <span class="mono">${esc(DATA_URL)}</span></div>
            <div class="hr"></div>
            <pre>${esc(String(e?.message || e))}</pre>
            <div class="hr"></div>
            <div class="muted small">
              GitHub Pages gotcha: ensure the file is committed under <span class="mono">/data</span> and that Pages is serving from the correct branch/folder.
            </div>
          </div>
        </div>
      `;
    }
  }

  window.addEventListener("hashchange", () => {
    loadStateFromUrl();
    render();
  });

  init();
})();
