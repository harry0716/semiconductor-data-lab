import {
  addYieldBand,
  buildReport,
  columnDictionary,
  convertColumnToNumber,
  createSnapshot,
  describeNumeric,
  fillMissingWithMean,
  filterNumericRange,
  formatNumber,
  getColumns,
  groupMean,
  histogram,
  inferSchema,
  linearRegression,
  normalizeCategory,
  normalizeMachineId,
  parseCsv,
  qualityReport,
  correlation,
  removeDuplicateRows,
  removeRowsWithMissing,
  sortByColumn,
  toNumber,
  validateLearningProgress
} from "./core.mjs";
import { datasetCatalog, embeddedDatasets, sampleCsv } from "./sample-data.mjs";

const defaultDataset = datasetCatalog[0];

const hints = {
  observe: {
    title: "原始資料觀察提示",
    levels: [
      "先不要急著清理資料，請用欄位名稱判斷每一列與每一欄的意義。",
      "製程輸入通常是可控制參數，例如溫度、壓力、時間；品質結果通常是良率或缺陷數。",
      "可以特別看看 Machine_ID、Yield、Process_Time 與 Timestamp 是否有不一致或缺漏。",
      "若你發現 EQ-03 的溫度與缺陷數偏高，請先記錄為觀察，不要直接跳到結論。"
    ]
  },
  import: {
    title: "匯入提示",
    levels: [
      "可先使用示範資料，確認流程後再上傳自己的 CSV。",
      "匯入後先看前幾筆資料是否與原始檔一致。",
      "若欄位名稱重複或空白，後續分析會失去明確意義。",
      "目前本機 MVP 支援 CSV；XLSX 將在後端匯入服務階段加入。"
    ]
  },
  quality: {
    title: "品質檢查提示",
    levels: [
      "品質檢查先看事實，不要立刻刪資料。",
      "缺值、重複、類別命名不一致與非數值內容，都可能影響後續分析。",
      "Machine_ID 若有多種寫法，會讓同一設備被分成不同群組。",
      "EQ-03 的良率偏低是可能發現，但你仍需用處理後資料與圖表支持。"
    ]
  },
  transform: {
    title: "資料處理提示",
    levels: [
      "每次處理前先寫理由，最後報告會引用這些理由。",
      "建議先處理命名不一致與重複資料，再處理缺值或型態問題。",
      "刪除資料會改變樣本數；填補資料會改變統計分布，兩者都要說明理由。",
      "如果目標是比較設備良率，正規化 Machine_ID 幾乎是必要步驟。"
    ]
  },
  visualize: {
    title: "視覺化提示",
    levels: [
      "長條圖適合比較設備平均良率，散佈圖適合看兩個數值欄位關係。",
      "請觀察圖表是否支持你的資料品質判斷與處理選擇。",
      "若類別太多，圓餅圖通常不適合精確比較。",
      "若 EQ-03 明顯低於其他設備，可再用相關性或群組比較確認。"
    ]
  },
  analysis: {
    title: "分析提示",
    levels: [
      "描述統計讓你知道欄位分布，群組比較讓你比較不同設備。",
      "相關係數接近 -1 表示強負相關，接近 0 表示線性關係弱。",
      "相關不等於因果，請避免直接說溫度造成良率下降。",
      "可以寫成：在本資料中，溫度較高的批次通常伴隨較低良率，但仍需更多實驗控制確認。"
    ]
  },
  report: {
    title: "報告提示",
    levels: [
      "報告應包含你做過的處理，而不只是最後答案。",
      "請把資料品質、處理理由、圖表證據與分析結果串成一個合理故事。",
      "限制可以包含模擬資料、樣本數有限、清理方式會影響結果等。",
      "好的結論會說明資料支持什麼，也會說明資料不能支持什麼。"
    ]
  }
};

const state = {
  originalRows: [],
  rows: [],
  history: [],
  observations: {},
  qualityDecisions: {},
  chartNotes: {},
  analysisNotes: {},
  conclusion: "",
  hintUsage: [],
  lastAnalysis: null,
  selectedDataset: defaultDataset
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setNested(path, value) {
  const parts = path.split(".");
  let target = state;
  while (parts.length > 1) {
    const key = parts.shift();
    target[key] = target[key] || {};
    target = target[key];
  }
  target[parts[0]] = value;
  renderProgress();
}

function getNested(path) {
  return path.split(".").reduce((target, key) => target?.[key], state) ?? "";
}

function bindInputs() {
  $$("[data-field]").forEach((input) => {
    input.value = getNested(input.dataset.field);
    input.addEventListener("input", () => setNested(input.dataset.field, input.value));
  });
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadSample() {
  const dataset = state.selectedDataset || defaultDataset;
  try {
    if (location.protocol === "http:" || location.protocol === "https:") {
      const response = await fetch(`../${dataset.path}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      loadCsv(text, `已載入：${dataset.title}`);
      return;
    }
    throw new Error("local file mode");
  } catch (error) {
    loadCsv(embeddedDatasets[dataset.id] || sampleCsv, `已載入內建資料：${dataset.title}`);
  }
}

function loadCsv(text, message) {
  try {
    const rows = parseCsv(text);
    state.originalRows = rows;
    state.rows = rows;
    state.history = [createSnapshot([], "載入原始資料", rows, "建立原始資料版本。")];
    $("#import-message").textContent = message;
    renderAll();
  } catch (error) {
    $("#import-message").textContent = error.message;
  }
}

function renderDictionary() {
  const rows = Object.entries(columnDictionary).map(([name, meta]) => ({
    欄位: name,
    中文說明: meta.label,
    角色: meta.role,
    單位: meta.unit || "-"
  }));
  $("#dictionary-table").innerHTML = table(["欄位", "中文說明", "角色", "單位"], rows);
}

function renderDatasetSelector() {
  const select = $("#dataset-select");
  if (!select) return;
  select.innerHTML = datasetCatalog.map((dataset) => (
    `<option value="${dataset.id}">${dataset.title}（${dataset.difficulty}）</option>`
  )).join("");
  select.value = state.selectedDataset?.id || defaultDataset.id;
  updateDatasetInfo();
}

function updateDatasetInfo() {
  const dataset = state.selectedDataset || defaultDataset;
  $("#assignment-title").textContent = dataset.caseName;
  $("#assignment-description").textContent = `${dataset.title}。請觀察原始資料中的缺值、重複、型態衝突、類別命名不一致或異常批次，再決定處理與分析方式。`;
  const download = $("#download-current");
  if (download) {
    download.textContent = `下載 ${dataset.path.split("/").pop()}`;
  }
}

function downloadCurrentDataset() {
  const dataset = state.selectedDataset || defaultDataset;
  const csv = embeddedDatasets[dataset.id] || sampleCsv;
  const filename = dataset.path.split("/").pop() || `${dataset.id}.csv`;
  const blob = new Blob([`\uFEFF${csv}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  $("#import-message").textContent = `已產生可下載 CSV：${link.download}`;
}

function renderPreview() {
  if (!state.rows.length) {
    $("#preview-table").innerHTML = `<p class="empty">尚未載入資料。</p>`;
    return;
  }
  const headers = getColumns(state.rows);
  $("#preview-table").innerHTML = table(headers, state.rows.slice(0, 12));
}

function renderMetrics() {
  const metrics = $("#dataset-metrics").querySelectorAll("span");
  metrics[0].textContent = state.rows.length || "-";
  metrics[1].textContent = state.rows.length ? getColumns(state.rows).length : "-";
  metrics[2].textContent = Math.max(0, state.history.length - 1);
  metrics[3].textContent = state.hintUsage.length;
}

function renderQuality() {
  if (!state.rows.length) {
    $("#quality-summary").innerHTML = `<p class="empty">載入資料後會顯示品質檢查。</p>`;
    $("#quality-decisions").innerHTML = "";
    return;
  }
  const report = qualityReport(state.rows);
  $("#quality-summary").innerHTML = report.issues.map((issue, index) => `
    <article class="issue ${issue.severity}">
      <h3>${escapeHtml(issue.title)}</h3>
      <p>${escapeHtml(issue.detail)}</p>
      <small>品質項目 ${index + 1}</small>
    </article>
  `).join("");

  const decisionItems = report.issues.slice(0, 4);
  $("#quality-decisions").innerHTML = decisionItems.map((issue, index) => `
    <label>${escapeHtml(issue.title)}：你的判斷與處理想法
      <textarea data-field="qualityDecisions.issue${index}">${escapeHtml(state.qualityDecisions[`issue${index}`] || "")}</textarea>
    </label>
  `).join("");
  bindInputs();
}

function applyTransform(label, transform) {
  if (!state.rows.length) return;
  const reason = $("#transform-reason").value.trim();
  if (!reason && !["還原上一步", "回到原始資料"].includes(label)) {
    $("#transform-reason").focus();
    $("#transform-reason").placeholder = "請先寫處理理由，這會進入操作歷程。";
    return;
  }
  const nextRows = transform(state.rows);
  state.rows = nextRows;
  state.history.push(createSnapshot(state.history, label, nextRows, reason || label));
  $("#transform-reason").value = "";
  renderAll();
}

function handleAction(action) {
  const numericColumns = ["Process_Time", "Temperature", "Pressure", "Defect_Count", "Yield"];
  const actions = {
    normalizeMachine: () => applyTransform("正規化 Machine_ID", (rows) => normalizeCategory(rows, "Machine_ID", normalizeMachineId)),
    removeDuplicates: () => applyTransform("移除重複列", removeDuplicateRows),
    removeMissingYield: () => applyTransform("移除 Yield 缺值", (rows) => removeRowsWithMissing(rows, "Yield")),
    fillYieldMean: () => applyTransform("以平均值填補 Yield", (rows) => fillMissingWithMean(rows, "Yield")),
    convertNumeric: () => applyTransform("轉換數值欄位", (rows) => numericColumns.reduce((current, column) => convertColumnToNumber(current, column), rows)),
    addYieldBand: () => applyTransform("建立良率區間", addYieldBand),
    filterTemperature: () => applyTransform("保留溫度 70-82", (rows) => filterNumericRange(rows, "Temperature", 70, 82)),
    sortYield: () => applyTransform("依良率排序", (rows) => sortByColumn(rows, "Yield", "asc")),
    undo: () => {
      if (state.history.length <= 1) return;
      state.history.pop();
      state.rows = state.history[state.history.length - 1].rows.map((row) => ({ ...row }));
      renderAll();
    },
    reset: () => {
      if (!state.originalRows.length) return;
      state.rows = state.originalRows.map((row) => ({ ...row }));
      state.history = [createSnapshot([], "載入原始資料", state.rows, "回到原始資料。")];
      renderAll();
    }
  };
  actions[action]?.();
}

function renderHistory() {
  if (!state.history.length) {
    $("#history-table").innerHTML = `<p class="empty">尚無處理歷程。</p>`;
    return;
  }
  const rows = state.history.map((item) => ({
    版本: item.id,
    操作: item.label,
    理由: item.reason,
    操作前: item.before,
    操作後: item.after,
    影響筆數: item.affected
  }));
  $("#history-table").innerHTML = table(["版本", "操作", "理由", "操作前", "操作後", "影響筆數"], rows);
}

function drawAxes(ctx, width, height, padding) {
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawBarChart() {
  const canvas = $("#bar-chart");
  const ctx = clearCanvas(canvas);
  const profile = getAnalysisProfile();
  $("#bar-chart-title").textContent = profile.groupTitle;
  const data = state.rows.length && profile.groupColumn && profile.valueColumn ? groupMean(state.rows, profile.groupColumn, profile.valueColumn) : [];
  if (!data.length) return;
  const padding = 54;
  const width = canvas.width;
  const height = canvas.height;
  drawAxes(ctx, width, height, padding);
  const max = Math.max(...data.map((item) => item.mean));
  const min = Math.min(...data.map((item) => item.mean), 0);
  const barWidth = (width - padding * 2) / data.length * 0.65;
  data.forEach((item, index) => {
    const x = padding + index * ((width - padding * 2) / data.length) + 18;
    const barHeight = (height - padding * 2) * ((item.mean - min) / (max - min || 1));
    const y = height - padding - barHeight;
    ctx.fillStyle = /03|B|INS-02/i.test(item.group) ? "#dc2626" : "#2563eb";
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#0f172a";
    ctx.font = "14px system-ui";
    ctx.fillText(item.group, x, height - 24);
    ctx.fillText(formatNumber(item.mean, 1), x, y - 8);
  });
}

function drawScatterChart() {
  const canvas = $("#scatter-chart");
  const ctx = clearCanvas(canvas);
  if (!state.rows.length) return;
  const profile = getAnalysisProfile();
  $("#scatter-chart-title").textContent = profile.scatterTitle;
  const points = state.rows.map((row) => ({
    x: toNumber(row[profile.xColumn]),
    y: toNumber(row[profile.yColumn]),
    group: row[profile.groupColumn]
  })).filter((point) => point.x !== null && point.y !== null);
  if (!points.length) return;
  const padding = 54;
  const width = canvas.width;
  const height = canvas.height;
  drawAxes(ctx, width, height, padding);
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  points.forEach((point) => {
    const x = padding + ((point.x - minX) / (maxX - minX || 1)) * (width - padding * 2);
    const y = height - padding - ((point.y - minY) / (maxY - minY || 1)) * (height - padding * 2);
    ctx.beginPath();
    ctx.fillStyle = point.group === "EQ-03" ? "#dc2626" : "#0891b2";
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#0f172a";
  ctx.font = "14px system-ui";
  ctx.fillText(profile.xColumn, width - 180, height - 18);
  ctx.save();
  ctx.translate(18, 140);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(profile.yColumn, 0, 0);
  ctx.restore();
}

function drawHistogram() {
  const canvas = $("#histogram-chart");
  const ctx = clearCanvas(canvas);
  const profile = getAnalysisProfile();
  $("#histogram-chart-title").textContent = profile.histogramTitle;
  const data = state.rows.length && profile.histogramColumn ? histogram(state.rows, profile.histogramColumn, 8) : [];
  if (!data.length) return;
  const padding = 54;
  const width = canvas.width;
  const height = canvas.height;
  drawAxes(ctx, width, height, padding);
  const max = Math.max(...data.map((item) => item.count));
  const barWidth = (width - padding * 2) / data.length * 0.78;
  data.forEach((item, index) => {
    const x = padding + index * ((width - padding * 2) / data.length) + 10;
    const barHeight = (height - padding * 2) * (item.count / max);
    const y = height - padding - barHeight;
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px system-ui";
    ctx.fillText(`${formatNumber(item.start, 0)}-${formatNumber(item.end, 0)}`, x - 4, height - 24);
  });
}

function renderCharts() {
  drawBarChart();
  drawScatterChart();
  drawHistogram();
}

function getAnalysisProfile(rows = state.rows) {
  const columns = getColumns(rows);
  if (columns.includes("Machine_ID") && columns.includes("Yield")) {
    return {
      groupColumn: "Machine_ID",
      valueColumn: "Yield",
      xColumn: "Temperature",
      yColumn: "Yield",
      histogramColumn: "Yield",
      valueLabel: "良率",
      groupTitle: "設備平均良率",
      scatterTitle: "溫度與良率",
      histogramTitle: "良率分布"
    };
  }
  if (columns.includes("Chamber_ID") && columns.includes("Thickness")) {
    return {
      groupColumn: "Chamber_ID",
      valueColumn: "Thickness",
      xColumn: "Gas_Flow",
      yColumn: "Thickness",
      histogramColumn: "Defect_Rate",
      valueLabel: "厚度",
      groupTitle: "腔體平均厚度",
      scatterTitle: "氣體流量與厚度",
      histogramTitle: "缺陷率分布"
    };
  }
  if (columns.includes("Inspection_Tool") && columns.includes("Overlay_Error")) {
    return {
      groupColumn: "Inspection_Tool",
      valueColumn: "Overlay_Error",
      xColumn: "Overlay_Error",
      yColumn: "Particle_Count",
      histogramColumn: "Review_Time",
      valueLabel: "疊對誤差",
      groupTitle: "檢測工具平均疊對誤差",
      scatterTitle: "疊對誤差與粒子數",
      histogramTitle: "複判時間分布"
    };
  }
  const schema = inferSchema(rows);
  const category = schema.find((column) => column.type === "category")?.name;
  const numeric = schema.filter((column) => column.type === "number").map((column) => column.name);
  return {
    groupColumn: category,
    valueColumn: numeric[0],
    xColumn: numeric[0],
    yColumn: numeric[1] || numeric[0],
    histogramColumn: numeric[0],
    valueLabel: numeric[0] || "數值",
    groupTitle: "群組平均比較",
    scatterTitle: "數值欄位關係",
    histogramTitle: "數值分布"
  };
}

function renderAnalysis() {
  if (!state.rows.length) {
    $("#analysis-output").innerHTML = `<p class="empty">載入並處理資料後會顯示分析結果。</p>`;
    return;
  }
  const profile = getAnalysisProfile();
  const stats = describeNumeric(state.rows, profile.valueColumn);
  const grouped = profile.groupColumn && profile.valueColumn ? groupMean(state.rows, profile.groupColumn, profile.valueColumn) : [];
  const primaryCorrelation = profile.xColumn && profile.yColumn ? correlation(state.rows, profile.xColumn, profile.yColumn) : null;
  const regression = profile.xColumn && profile.yColumn ? linearRegression(state.rows, profile.xColumn, profile.yColumn) : null;
  const analysis = {
    descriptions: stats ? [stats] : [],
    groupComparison: grouped,
    correlations: primaryCorrelation ? [primaryCorrelation] : [],
    regression
  };
  state.lastAnalysis = analysis;
  const groupRows = grouped.map((item) => `
    <tr><td>${escapeHtml(item.group)}</td><td>${item.count}</td><td>${formatNumber(item.mean)}</td><td>${formatNumber(item.min)}</td><td>${formatNumber(item.max)}</td></tr>
  `).join("");
  const corrRows = analysis.correlations.map((item) => `
    <tr><td>${escapeHtml(item.xColumn)} vs ${escapeHtml(item.yColumn)}</td><td>${item.count}</td><td>${formatNumber(item.r, 3)}</td></tr>
  `).join("");
  $("#analysis-output").innerHTML = `
    <article>
      <h3>${escapeHtml(profile.valueLabel)}描述統計</h3>
      <p>有效筆數 ${stats?.count ?? 0}，平均 ${formatNumber(stats?.mean)}，中位數 ${formatNumber(stats?.median)}，最小 ${formatNumber(stats?.min)}，最大 ${formatNumber(stats?.max)}。</p>
    </article>
    <article>
      <h3>${escapeHtml(profile.groupColumn || "群組")}群組比較</h3>
      <table><thead><tr><th>群組</th><th>筆數</th><th>平均${escapeHtml(profile.valueLabel)}</th><th>最低</th><th>最高</th></tr></thead><tbody>${groupRows}</tbody></table>
    </article>
    <article>
      <h3>相關性分析</h3>
      <table><thead><tr><th>欄位</th><th>有效筆數</th><th>r</th></tr></thead><tbody>${corrRows}</tbody></table>
    </article>
    <article>
      <h3>簡單線性迴歸</h3>
      <p>${analysis.regression ? `${escapeHtml(profile.yColumn)} = ${formatNumber(analysis.regression.intercept, 2)} + ${formatNumber(analysis.regression.slope, 3)} × ${escapeHtml(profile.xColumn)}` : "資料不足，無法建立迴歸。"}</p>
    </article>
  `;
}

function renderProgress() {
  const checks = validateLearningProgress(state);
  $("#progress-list").innerHTML = checks.map((check) => `
    <div class="progress-item ${check.done ? "done" : ""}">
      <span>${check.done ? "✓" : "○"}</span>
      <p>${escapeHtml(check.label)}</p>
    </div>
  `).join("");
  renderMetrics();
}

function showHint(key) {
  const hint = hints[key];
  const used = state.hintUsage.filter((item) => item.key === key).length;
  const level = Math.min(used, hint.levels.length - 1);
  state.hintUsage.push({ key, level: level + 1, usedAt: new Date().toISOString() });
  $("#hint-title").textContent = `${hint.title}（第 ${level + 1} 層）`;
  $("#hint-content").innerHTML = `<p>${escapeHtml(hint.levels[level])}</p>`;
  $("#hint-dialog").showModal();
  renderProgress();
}

function buildReportPreview() {
  const report = buildReport(state);
  const groupRows = report.analysis?.groupComparison?.map((item) => `<tr><td>${escapeHtml(item.group)}</td><td>${item.count}</td><td>${formatNumber(item.mean)}</td></tr>`).join("") || "";
  $("#report-preview").innerHTML = `
    <h2>${escapeHtml(report.title)}</h2>
    <p class="note">產生時間：${escapeHtml(report.generatedAt)}</p>
    <h3>一、原始資料觀察</h3>
    <p>${escapeHtml(Object.values(report.observations || {}).filter(Boolean).join("\n"))}</p>
    <h3>二、資料品質判斷</h3>
    <p>${escapeHtml(Object.values(report.qualityDecisions || {}).filter(Boolean).join("\n"))}</p>
    <h3>三、資料處理歷程</h3>
    <table><thead><tr><th>版本</th><th>操作</th><th>理由</th><th>前</th><th>後</th></tr></thead><tbody>
      ${report.history.map((item) => `<tr><td>${item.id}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.reason)}</td><td>${item.before}</td><td>${item.after}</td></tr>`).join("")}
    </tbody></table>
    <h3>四、視覺化解讀</h3>
    <p>${escapeHtml(Object.values(report.chartNotes || {}).filter(Boolean).join("\n"))}</p>
    <h3>五、分析結果</h3>
    <table><thead><tr><th>設備</th><th>筆數</th><th>平均良率</th></tr></thead><tbody>${groupRows}</tbody></table>
    <p>${escapeHtml(Object.values(report.analysisNotes || {}).filter(Boolean).join("\n"))}</p>
    <h3>六、結論、限制與反思</h3>
    <p>${escapeHtml(report.conclusion || "")}</p>
  `;
}

function exportReport() {
  buildReportPreview();
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>資料分析報告</title><style>body{font-family:system-ui,'Microsoft JhengHei',sans-serif;line-height:1.7;max-width:960px;margin:40px auto;color:#0f172a}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}h1,h2,h3{color:#0f172a}p{white-space:pre-line}</style></head><body>${$("#report-preview").innerHTML}</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "semiconductor-data-analysis-report.html";
  link.click();
  URL.revokeObjectURL(url);
}

function renderSchemaSummary() {
  if (!state.rows.length) return;
  console.info("Schema", inferSchema(state.rows));
}

function renderAll() {
  renderDatasetSelector();
  renderDictionary();
  renderPreview();
  renderQuality();
  renderHistory();
  renderCharts();
  renderAnalysis();
  renderProgress();
  renderSchemaSummary();
  bindInputs();
}

function setupEvents() {
  $("#load-sample").addEventListener("click", loadSample);
  $("#download-current").addEventListener("click", downloadCurrentDataset);
  $("#dataset-select").addEventListener("change", (event) => {
    state.selectedDataset = datasetCatalog.find((dataset) => dataset.id === event.target.value) || defaultDataset;
    updateDatasetInfo();
    loadSample();
  });
  $("#file-input").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      $("#import-message").textContent = "目前本機 MVP 僅支援 CSV。XLSX 將由後端匯入服務支援。";
      return;
    }
    loadCsv(await file.text(), `已匯入 ${file.name}。`);
  });
  $$("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
  $$(".hint-button").forEach((button) => {
    button.addEventListener("click", () => showHint(button.dataset.hint));
  });
  $("#build-report").addEventListener("click", buildReportPreview);
  $("#export-report").addEventListener("click", exportReport);
  $("#print-report").addEventListener("click", () => {
    buildReportPreview();
    window.print();
  });
}

setupEvents();
renderAll();
loadSample();
