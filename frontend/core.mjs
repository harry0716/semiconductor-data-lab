const numericPattern = /^-?\d+(\.\d+)?$/;

export const columnDictionary = {
  Lot_ID: { label: "批次編號", role: "批次識別", unit: "" },
  Wafer_ID: { label: "晶圓編號", role: "樣本識別", unit: "" },
  Machine_ID: { label: "設備編號", role: "製程設備", unit: "" },
  Process_Time: { label: "製程時間", role: "製程輸入", unit: "秒" },
  Temperature: { label: "溫度", role: "製程輸入", unit: "攝氏度" },
  Pressure: { label: "壓力", role: "製程輸入", unit: "Torr" },
  Defect_Count: { label: "缺陷數", role: "品質結果", unit: "個" },
  Yield: { label: "良率", role: "品質結果", unit: "%" },
  Timestamp: { label: "時間戳記", role: "製程時間", unit: "" }
  ,
  Batch_ID: { label: "批次編號", role: "批次識別", unit: "" },
  Chamber_ID: { label: "腔體編號", role: "製程設備", unit: "" },
  Recipe_ID: { label: "配方編號", role: "製程條件", unit: "" },
  Gas_Flow: { label: "氣體流量", role: "製程輸入", unit: "sccm" },
  RF_Power: { label: "射頻功率", role: "製程輸入", unit: "W" },
  Etch_Time: { label: "蝕刻時間", role: "製程輸入", unit: "秒" },
  Thickness: { label: "薄膜厚度", role: "品質結果", unit: "nm" },
  Defect_Rate: { label: "缺陷率", role: "品質結果", unit: "%" },
  Inspection_ID: { label: "檢測編號", role: "檢測識別", unit: "" },
  Product_Type: { label: "產品類型", role: "產品分類", unit: "" },
  Inspection_Tool: { label: "檢測工具", role: "檢測設備", unit: "" },
  Line_Width: { label: "線寬", role: "品質結果", unit: "nm" },
  Overlay_Error: { label: "疊對誤差", role: "品質結果", unit: "nm" },
  Particle_Count: { label: "粒子數", role: "品質結果", unit: "個" },
  Pass_Fail: { label: "通過狀態", role: "檢測結果", unit: "" },
  Review_Time: { label: "複判時間", role: "作業時間", unit: "分鐘" }
};

export function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  if (current || row.length) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  if (rows.length < 2) {
    throw new Error("CSV 至少需要標題列與一筆資料。");
  }
  const headers = rows[0].map((header) => header.trim());
  const seen = new Set();
  headers.forEach((header) => {
    if (!header) throw new Error("CSV 存在空白欄位名稱。");
    if (seen.has(header)) throw new Error(`CSV 存在重複欄位：${header}`);
    seen.add(header);
  });
  return rows.slice(1).map((cells, rowIndex) => {
    const record = { __rowId: rowIndex + 1 };
    headers.forEach((header, columnIndex) => {
      record[header] = (cells[columnIndex] ?? "").trim();
    });
    return record;
  });
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]).filter((key) => !key.startsWith("__"));
  const escape = (value) => {
    const text = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

export function getColumns(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).filter((key) => !key.startsWith("__"));
}

export function isMissing(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

export function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isMissing(value)) return null;
  const text = String(value).trim();
  if (!numericPattern.test(text)) return null;
  return Number(text);
}

export function inferColumnType(rows, column) {
  const values = rows.map((row) => row[column]).filter((value) => !isMissing(value));
  if (!values.length) return "empty";
  const numeric = values.filter((value) => toNumber(value) !== null).length;
  const dateLike = values.filter((value) => !Number.isNaN(Date.parse(value))).length;
  if (numeric / values.length >= 0.85) return "number";
  if (dateLike / values.length >= 0.85) return "date";
  return "category";
}

export function inferSchema(rows) {
  return getColumns(rows).map((column) => {
    const values = rows.map((row) => row[column]);
    const nonMissing = values.filter((value) => !isMissing(value));
    const unique = new Set(nonMissing.map((value) => String(value).trim())).size;
    return {
      name: column,
      type: inferColumnType(rows, column),
      missing: rows.length - nonMissing.length,
      unique,
      ...columnDictionary[column]
    };
  });
}

export function describeNumeric(rows, column) {
  const values = rows.map((row) => toNumber(row[column])).filter((value) => value !== null).sort((a, b) => a - b);
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return {
    column,
    count: values.length,
    missing: rows.length - values.length,
    min: values[0],
    max: values[values.length - 1],
    mean,
    median: percentile(values, 0.5),
    q1: percentile(values, 0.25),
    q3: percentile(values, 0.75),
    std: Math.sqrt(variance)
  };
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const index = (values.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

export function detectOutliers(rows, column) {
  const stats = describeNumeric(rows, column);
  if (!stats) return [];
  const iqr = stats.q3 - stats.q1;
  const lower = stats.q1 - 1.5 * iqr;
  const upper = stats.q3 + 1.5 * iqr;
  return rows.filter((row) => {
    const value = toNumber(row[column]);
    return value !== null && (value < lower || value > upper);
  });
}

export function findDuplicateRows(rows) {
  const seen = new Map();
  const duplicates = [];
  rows.forEach((row) => {
    const key = JSON.stringify(getColumns([row]).map((column) => row[column]));
    if (seen.has(key)) duplicates.push(row);
    else seen.set(key, row);
  });
  return duplicates;
}

export function normalizeMachineId(value) {
  if (isMissing(value)) return "";
  const match = String(value).trim().toUpperCase().replaceAll("-", "").match(/^EQ(\d+)$/);
  if (!match) return String(value).trim().toUpperCase();
  return `EQ-${match[1].padStart(2, "0")}`;
}

export function qualityReport(rows) {
  const schema = inferSchema(rows);
  const issues = [];
  const duplicates = findDuplicateRows(rows);
  if (duplicates.length) {
    issues.push({
      severity: "warning",
      title: "偵測到重複資料",
      detail: `共有 ${duplicates.length} 筆完整重複列，可能會影響平均值與分布判讀。`
    });
  }
  schema.forEach((column) => {
    if (column.missing > 0) {
      issues.push({
        severity: "warning",
        title: `${column.name} 有缺值`,
        detail: `${column.name} 缺少 ${column.missing} 筆，占 ${(column.missing / rows.length * 100).toFixed(1)}%。`
      });
    }
    if (column.type === "number") {
      const invalid = rows.filter((row) => !isMissing(row[column.name]) && toNumber(row[column.name]) === null);
      if (invalid.length) {
        issues.push({
          severity: "warning",
          title: `${column.name} 存在非數值內容`,
          detail: `有 ${invalid.length} 筆資料無法轉為數值，範例：${invalid.slice(0, 2).map((row) => row[column.name]).join("、")}。`
        });
      }
      const outliers = detectOutliers(rows, column.name);
      if (outliers.length) {
        issues.push({
          severity: "notice",
          title: `${column.name} 有疑似異常值`,
          detail: `依 IQR 規則偵測到 ${outliers.length} 筆疑似異常值，建議先觀察再決定是否排除。`
        });
      }
    }
  });
  if (getColumns(rows).includes("Machine_ID")) {
    const original = new Set(rows.map((row) => row.Machine_ID).filter((value) => !isMissing(value)));
    const normalized = new Set(rows.map((row) => normalizeMachineId(row.Machine_ID)).filter(Boolean));
    if (original.size > normalized.size) {
      issues.push({
        severity: "warning",
        title: "設備名稱命名不一致",
        detail: `Machine_ID 有 ${original.size} 種寫法，正規化後為 ${normalized.size} 種設備。`
      });
    }
  }
  if (getColumns(rows).includes("Timestamp")) {
    const formats = new Set(rows.map((row) => String(row.Timestamp || "").includes("/") ? "slash" : "dash"));
    if (formats.size > 1) {
      issues.push({
        severity: "notice",
        title: "日期格式不一致",
        detail: "Timestamp 混用不同日期格式，正式分析前應統一格式。"
      });
    }
  }
  return { schema, issues };
}

export function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

export function removeDuplicateRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = JSON.stringify(getColumns([row]).map((column) => row[column]));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function removeRowsWithMissing(rows, column) {
  return rows.filter((row) => !isMissing(row[column]));
}

export function fillMissingWithMean(rows, column) {
  const stats = describeNumeric(rows, column);
  if (!stats) return cloneRows(rows);
  return rows.map((row) => ({
    ...row,
    [column]: isMissing(row[column]) ? Number(stats.mean.toFixed(3)) : row[column]
  }));
}

export function convertColumnToNumber(rows, column) {
  return rows.map((row) => {
    const value = toNumber(row[column]);
    return { ...row, [column]: value === null ? "" : value };
  });
}

export function normalizeCategory(rows, column, normalizer = (value) => value) {
  return rows.map((row) => ({ ...row, [column]: normalizer(row[column]) }));
}

export function addYieldBand(rows) {
  return rows.map((row) => {
    const yieldValue = toNumber(row.Yield);
    let band = "未分類";
    if (yieldValue !== null) {
      if (yieldValue >= 95) band = "高良率";
      else if (yieldValue >= 90) band = "中良率";
      else band = "低良率";
    }
    return { ...row, Yield_Band: band };
  });
}

export function filterNumericRange(rows, column, min, max) {
  return rows.filter((row) => {
    const value = toNumber(row[column]);
    return value !== null && value >= min && value <= max;
  });
}

export function sortByColumn(rows, column, direction = "asc") {
  const factor = direction === "desc" ? -1 : 1;
  return cloneRows(rows).sort((a, b) => {
    const an = toNumber(a[column]);
    const bn = toNumber(b[column]);
    const av = an ?? String(a[column] ?? "");
    const bv = bn ?? String(b[column] ?? "");
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
}

export function groupMean(rows, groupColumn, valueColumn) {
  const groups = new Map();
  rows.forEach((row) => {
    const group = row[groupColumn] || "未填寫";
    const value = toNumber(row[valueColumn]);
    if (value === null) return;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(value);
  });
  return Array.from(groups.entries()).map(([group, values]) => ({
    group,
    count: values.length,
    mean: values.reduce((total, value) => total + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values)
  })).sort((a, b) => a.group.localeCompare(b.group));
}

export function histogram(rows, column, bins = 8) {
  const values = rows.map((row) => toNumber(row[column])).filter((value) => value !== null);
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min || 1) / bins;
  return Array.from({ length: bins }, (_, index) => {
    const start = min + width * index;
    const end = index === bins - 1 ? max : start + width;
    const count = values.filter((value) => value >= start && (index === bins - 1 ? value <= end : value < end)).length;
    return { start, end, count };
  });
}

export function correlation(rows, xColumn, yColumn) {
  const pairs = rows.map((row) => [toNumber(row[xColumn]), toNumber(row[yColumn])])
    .filter(([x, y]) => x !== null && y !== null);
  if (pairs.length < 2) return null;
  const meanX = pairs.reduce((total, [x]) => total + x, 0) / pairs.length;
  const meanY = pairs.reduce((total, [, y]) => total + y, 0) / pairs.length;
  const numerator = pairs.reduce((total, [x, y]) => total + (x - meanX) * (y - meanY), 0);
  const denomX = Math.sqrt(pairs.reduce((total, [x]) => total + (x - meanX) ** 2, 0));
  const denomY = Math.sqrt(pairs.reduce((total, [, y]) => total + (y - meanY) ** 2, 0));
  if (!denomX || !denomY) return null;
  return { xColumn, yColumn, count: pairs.length, r: numerator / (denomX * denomY) };
}

export function linearRegression(rows, xColumn, yColumn) {
  const pairs = rows.map((row) => [toNumber(row[xColumn]), toNumber(row[yColumn])])
    .filter(([x, y]) => x !== null && y !== null);
  if (pairs.length < 2) return null;
  const meanX = pairs.reduce((total, [x]) => total + x, 0) / pairs.length;
  const meanY = pairs.reduce((total, [, y]) => total + y, 0) / pairs.length;
  const numerator = pairs.reduce((total, [x, y]) => total + (x - meanX) * (y - meanY), 0);
  const denominator = pairs.reduce((total, [x]) => total + (x - meanX) ** 2, 0);
  if (!denominator) return null;
  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  return { xColumn, yColumn, count: pairs.length, slope, intercept };
}

export function analyzeDataset(rows) {
  const numericColumns = inferSchema(rows).filter((column) => column.type === "number").map((column) => column.name);
  const descriptions = numericColumns.map((column) => describeNumeric(rows, column)).filter(Boolean);
  const groupComparison = getColumns(rows).includes("Machine_ID") && getColumns(rows).includes("Yield")
    ? groupMean(rows, "Machine_ID", "Yield")
    : [];
  const tempYieldCorrelation = getColumns(rows).includes("Temperature") && getColumns(rows).includes("Yield")
    ? correlation(rows, "Temperature", "Yield")
    : null;
  const defectYieldCorrelation = getColumns(rows).includes("Defect_Count") && getColumns(rows).includes("Yield")
    ? correlation(rows, "Defect_Count", "Yield")
    : null;
  const regression = getColumns(rows).includes("Temperature") && getColumns(rows).includes("Yield")
    ? linearRegression(rows, "Temperature", "Yield")
    : null;
  return {
    descriptions,
    groupComparison,
    correlations: [tempYieldCorrelation, defectYieldCorrelation].filter(Boolean),
    regression
  };
}

export function createSnapshot(history, label, rows, reason = "") {
  const previous = history[history.length - 1];
  return {
    id: `S${history.length}`,
    label,
    reason,
    rows: cloneRows(rows),
    before: previous ? previous.rows.length : rows.length,
    after: rows.length,
    affected: previous ? Math.abs(previous.rows.length - rows.length) : 0,
    createdAt: new Date().toISOString()
  };
}

export function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toFixed(digits);
}

export function buildReport({ observations, qualityDecisions, chartNotes, analysisNotes, conclusion, history, analysis }) {
  return {
    title: "設備製程參數與良率分析報告",
    generatedAt: new Date().toLocaleString("zh-TW"),
    observations,
    qualityDecisions,
    chartNotes,
    analysisNotes,
    conclusion,
    history: history.map((snapshot) => ({
      id: snapshot.id,
      label: snapshot.label,
      reason: snapshot.reason,
      before: snapshot.before,
      after: snapshot.after,
      affected: snapshot.affected,
      createdAt: snapshot.createdAt
    })),
    analysis
  };
}

export function validateLearningProgress(state) {
  const checks = [
    { key: "observed", label: "完成原始資料觀察", done: Object.values(state.observations || {}).some((value) => String(value).trim().length >= 8) },
    { key: "imported", label: "匯入或載入資料", done: Array.isArray(state.rows) && state.rows.length > 0 },
    { key: "quality", label: "完成至少一項品質判斷", done: Object.values(state.qualityDecisions || {}).some((value) => String(value).trim().length >= 8) },
    { key: "processed", label: "完成至少一個資料處理步驟", done: Array.isArray(state.history) && state.history.length > 1 },
    { key: "visualized", label: "保存至少一則圖表解讀", done: Object.values(state.chartNotes || {}).some((value) => String(value).trim().length >= 8) },
    { key: "analyzed", label: "保存至少一則分析解讀", done: Object.values(state.analysisNotes || {}).some((value) => String(value).trim().length >= 8) },
    { key: "reported", label: "完成結論與限制", done: String(state.conclusion || "").trim().length >= 12 }
  ];
  return checks;
}
