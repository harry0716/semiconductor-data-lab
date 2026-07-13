import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import {
  addYieldBand,
  analyzeDataset,
  convertColumnToNumber,
  correlation,
  fillMissingWithMean,
  groupMean,
  normalizeCategory,
  normalizeMachineId,
  parseCsv,
  qualityReport,
  removeDuplicateRows,
  removeRowsWithMissing,
  validateLearningProgress
} from "../frontend/core.mjs";
import { datasetCatalog, embeddedDatasets, sampleCsv } from "../frontend/sample-data.mjs";

assert.equal(datasetCatalog.length, 9, "應提供三種案例各三份資料，共 9 份");
assert.deepEqual(
  ["case-a", "case-b", "case-c"].map((caseId) => datasetCatalog.filter((dataset) => dataset.caseId === caseId).length),
  [3, 3, 3],
  "每個案例都應有 3 份資料"
);

for (const dataset of datasetCatalog) {
  const datasetCsv = await readFile(new URL(`../${dataset.path}`, import.meta.url), "utf8");
  const datasetRows = parseCsv(datasetCsv);
  const embeddedRowsForDataset = parseCsv(embeddedDatasets[dataset.id]);
  assert.ok(datasetRows.length >= 50, `${dataset.id} 至少應有 50 筆資料`);
  assert.equal(embeddedRowsForDataset.length, datasetRows.length, `${dataset.id} 的內建資料應與 CSV 筆數一致`);
  const datasetReport = qualityReport(datasetRows);
  assert.ok(datasetReport.issues.length >= 2, `${dataset.id} 應包含至少兩項教學用資料品質問題`);
}

const csv = await readFile(new URL("../datasets/beginner/case-a-equipment-yield-01.csv", import.meta.url), "utf8");
const rows = parseCsv(csv);
const embeddedRows = parseCsv(sampleCsv);

assert.ok(rows.length >= 50, "設備良率示範資料至少應有 50 筆");
assert.equal(embeddedRows.length, rows.length, "內建示範資料筆數應與 CSV 檔一致");
assert.equal(rows[0].Lot_ID, "LOT-2401", "應保留第一筆批次編號");

const report = qualityReport(rows);
assert.ok(report.issues.some((issue) => issue.title.includes("重複")), "應偵測重複資料");
assert.ok(report.issues.some((issue) => issue.title.includes("Yield 有缺值")), "應偵測 Yield 缺值");
assert.ok(report.issues.some((issue) => issue.title.includes("設備名稱")), "應偵測設備名稱不一致");

let processed = normalizeCategory(rows, "Machine_ID", normalizeMachineId);
assert.equal(new Set(processed.map((row) => row.Machine_ID)).size, 4, "設備名稱正規化後應剩 4 種");

processed = removeDuplicateRows(processed);
assert.equal(processed.length, rows.length - 1, "應移除 1 筆重複資料");

processed = removeRowsWithMissing(processed, "Yield");
assert.equal(processed.length, rows.length - 2, "應移除 1 筆 Yield 缺值");

processed = ["Process_Time", "Temperature", "Pressure", "Defect_Count", "Yield"].reduce(
  (current, column) => convertColumnToNumber(current, column),
  processed
);
processed = addYieldBand(processed);
assert.ok(processed.some((row) => row.Yield_Band === "低良率"), "應建立低良率區間");

const filled = fillMissingWithMean(rows, "Yield");
assert.equal(filled.filter((row) => row.Yield === "").length, 0, "平均值填補後 Yield 不應有空字串");

const groups = groupMean(processed, "Machine_ID", "Yield");
const eq03 = groups.find((group) => group.group === "EQ-03");
const eq04 = groups.find((group) => group.group === "EQ-04");
assert.ok(eq03.mean < eq04.mean, "EQ-03 平均良率應低於 EQ-04");

const tempYield = correlation(processed, "Temperature", "Yield");
assert.ok(tempYield.r < -0.5, "Temperature 與 Yield 應呈負相關");

const analysis = analyzeDataset(processed);
assert.ok(analysis.regression.slope < 0, "溫度對良率的簡單迴歸斜率應為負");

const progress = validateLearningProgress({
  rows: processed,
  history: [{}, {}],
  observations: { rowMeaning: "每一列代表一片晶圓的製程與檢測結果。" },
  qualityDecisions: { issue0: "Machine_ID 命名不一致，應先正規化。" },
  chartNotes: { bar: "EQ-03 的平均良率低於其他設備。" },
  analysisNotes: { group: "群組比較顯示設備間存在差異。" },
  conclusion: "本資料支持 EQ-03 可能存在製程異常，但仍需更多資料確認。"
});
assert.ok(progress.every((item) => item.done), "完整流程應通過學習進度檢核");

console.log("All smoke tests passed.");
