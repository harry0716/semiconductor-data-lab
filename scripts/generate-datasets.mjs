import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.cwd();

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function normal(random, mean = 0, sd = 1) {
  const u = Math.max(random(), 1e-9);
  const v = Math.max(random(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(headers, rows) {
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
}

function timestamp(day, hour, minute, slash = false) {
  const mm = String(minute).padStart(2, "0");
  if (slash) return `03/${String(day).padStart(2, "0")}/2026 ${String(hour).padStart(2, "0")}:${mm}`;
  return `2026-03-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${mm}`;
}

function equipmentYield(seed, variant) {
  const random = rng(seed);
  const machines = ["EQ-01", "EQ-02", "EQ-03", "EQ-04"];
  const aliases = {
    "EQ-01": ["EQ-01", "EQ01", "eq01"],
    "EQ-02": ["EQ-02", "EQ02"],
    "EQ-03": ["EQ-03", "eq03"],
    "EQ-04": ["EQ-04", "EQ04"]
  };
  const headers = ["Lot_ID", "Wafer_ID", "Machine_ID", "Process_Time", "Temperature", "Pressure", "Defect_Count", "Yield", "Timestamp"];
  const rows = [];
  let wafer = 1;
  for (let lot = 1; lot <= 18; lot += 1) {
    for (let sample = 0; sample < 3; sample += 1) {
      const machine = machines[(lot + sample + variant) % machines.length];
      const machineStress = machine === "EQ-03" ? 1 : 0;
      const day = 1 + Math.floor((lot - 1) / 5);
      const temp = 72 + machines.indexOf(machine) * 0.7 + normal(random, 0, 0.45) + machineStress * (5.2 + variant);
      const pressure = 2.18 + machines.indexOf(machine) * 0.035 + normal(random, 0, 0.015) + machineStress * 0.18;
      const processTime = 51 + machines.indexOf(machine) * 1.6 + normal(random, 0, 0.8) + machineStress * 3.2;
      const defects = Math.max(4, Math.round(10 + (temp - 72) * 4.4 + normal(random, 0, 2.6)));
      const yieldValue = Math.max(58, Math.min(98, 97 - defects * 0.34 - machineStress * (2.5 + variant) + normal(random, 0, 0.7)));
      rows.push({
        Lot_ID: `LOT-${2400 + lot}`,
        Wafer_ID: `W${String(wafer).padStart(3, "0")}`,
        Machine_ID: aliases[machine][Math.floor(random() * aliases[machine].length)],
        Process_Time: processTime.toFixed(1),
        Temperature: temp.toFixed(1),
        Pressure: pressure.toFixed(2),
        Defect_Count: defects,
        Yield: yieldValue.toFixed(1),
        Timestamp: timestamp(day, 8 + machines.indexOf(machine), sample * 12, day >= 4)
      });
      wafer += 1;
    }
  }
  rows[8].Yield = "";
  rows[16].Process_Time = "not_recorded";
  rows.splice(14, 0, { ...rows[13] });
  rows[rows.length - 3].Temperature = (86 + variant).toFixed(1);
  rows[rows.length - 3].Yield = (65 - variant).toFixed(1);
  return toCsv(headers, rows);
}

function batchDrift(seed, variant) {
  const random = rng(seed);
  const chambers = ["CH-A", "CH-B", "CH-C"];
  const recipes = ["RCP-ETCH-1", "RCP-ETCH-2"];
  const headers = ["Batch_ID", "Chamber_ID", "Recipe_ID", "Gas_Flow", "RF_Power", "Etch_Time", "Thickness", "Defect_Rate", "Timestamp"];
  const rows = [];
  for (let index = 0; index < 72; index += 1) {
    const chamber = chambers[index % chambers.length];
    const day = 1 + Math.floor(index / 18);
    const drift = index > 38 ? (index - 38) * (0.045 + variant * 0.006) : 0;
    const chamberShift = chamber === "CH-B" ? 1.2 : chamber === "CH-C" ? -0.7 : 0;
    const gas = 48 + chamberShift + normal(random, 0, 0.9) + drift;
    const power = 320 + chamberShift * 4 + normal(random, 0, 4.5) + drift * 7;
    const etch = 42 + normal(random, 0, 1.1) + drift * 0.8;
    const thickness = 104 - drift * (3.8 + variant * 0.4) + chamberShift * 0.6 + normal(random, 0, 1.3);
    const defectRate = Math.max(0.4, 1.7 + drift * (0.7 + variant * 0.08) + (chamber === "CH-B" ? 0.4 : 0) + normal(random, 0, 0.22));
    rows.push({
      Batch_ID: `B-${String(5200 + index).padStart(4, "0")}`,
      Chamber_ID: chamber === "CH-A" && index % 11 === 0 ? "cha" : chamber,
      Recipe_ID: recipes[(index + variant) % recipes.length],
      Gas_Flow: gas.toFixed(2),
      RF_Power: power.toFixed(1),
      Etch_Time: etch.toFixed(1),
      Thickness: thickness.toFixed(2),
      Defect_Rate: defectRate.toFixed(2),
      Timestamp: timestamp(day, 7 + (index % 10), (index * 7) % 60, index > 50)
    });
  }
  rows[21].Thickness = "";
  rows[33].Gas_Flow = "sensor_error";
  rows.splice(45, 0, { ...rows[44] });
  rows[61].Defect_Rate = (8.5 + variant).toFixed(2);
  return toCsv(headers, rows);
}

function inspectionQuality(seed, variant) {
  const random = rng(seed);
  const products = ["Logic-A", "Memory-B", "Sensor-C"];
  const tools = ["INS-01", "INS-02", "INS-03"];
  const headers = ["Inspection_ID", "Lot_ID", "Product_Type", "Inspection_Tool", "Line_Width", "Overlay_Error", "Particle_Count", "Pass_Fail", "Review_Time", "Timestamp"];
  const rows = [];
  for (let index = 0; index < 66; index += 1) {
    const product = products[index % products.length];
    const tool = tools[(index + variant) % tools.length];
    const drift = tool === "INS-02" && index > 30 ? (index - 30) * (0.012 + variant * 0.002) : 0;
    const line = 38 + products.indexOf(product) * 1.5 + normal(random, 0, 0.5) + drift;
    const overlay = Math.abs(normal(random, 2.1 + drift * 2, 0.55));
    const particle = Math.max(0, Math.round(8 + overlay * 2.2 + normal(random, 0, 2.4)));
    const pass = overlay < 4.1 && particle < 22 ? "PASS" : "FAIL";
    rows.push({
      Inspection_ID: `I-${String(7000 + index).padStart(4, "0")}`,
      Lot_ID: `LOT-${String(2500 + Math.floor(index / 3)).padStart(4, "0")}`,
      Product_Type: product,
      Inspection_Tool: index % 13 === 0 ? tool.toLowerCase() : tool,
      Line_Width: line.toFixed(2),
      Overlay_Error: overlay.toFixed(2),
      Particle_Count: particle,
      Pass_Fail: pass,
      Review_Time: (18 + normal(random, 0, 3) + (pass === "FAIL" ? 8 : 0)).toFixed(1),
      Timestamp: timestamp(1 + Math.floor(index / 16), 8 + (index % 8), (index * 9) % 60, index > 48)
    });
  }
  rows[12].Overlay_Error = "";
  rows[28].Line_Width = "manual_check";
  rows.splice(40, 0, { ...rows[39] });
  rows[55].Particle_Count = 64 + variant * 3;
  rows[56].Pass_Fail = "fail";
  return toCsv(headers, rows);
}

const datasets = [
  {
    id: "equipment-yield-01",
    caseId: "case-a",
    caseName: "案例 A：設備製程參數與良率分析",
    title: "A1 設備溫度偏移與良率下降",
    difficulty: "初階",
    path: "datasets/beginner/case-a-equipment-yield-01.csv",
    generator: () => equipmentYield(1101, 1)
  },
  {
    id: "equipment-yield-02",
    caseId: "case-a",
    caseName: "案例 A：設備製程參數與良率分析",
    title: "A2 壓力波動與缺陷數增加",
    difficulty: "初階",
    path: "datasets/beginner/case-a-equipment-yield-02.csv",
    generator: () => equipmentYield(1102, 2)
  },
  {
    id: "equipment-yield-03",
    caseId: "case-a",
    caseName: "案例 A：設備製程參數與良率分析",
    title: "A3 異常批次與設備比較",
    difficulty: "初階",
    path: "datasets/beginner/case-a-equipment-yield-03.csv",
    generator: () => equipmentYield(1103, 3)
  },
  {
    id: "batch-drift-01",
    caseId: "case-b",
    caseName: "案例 B：批次製程漂移分析",
    title: "B1 蝕刻厚度逐步漂移",
    difficulty: "中階",
    path: "datasets/intermediate/case-b-batch-drift-01.csv",
    generator: () => batchDrift(2201, 1)
  },
  {
    id: "batch-drift-02",
    caseId: "case-b",
    caseName: "案例 B：批次製程漂移分析",
    title: "B2 腔體差異與缺陷率升高",
    difficulty: "中階",
    path: "datasets/intermediate/case-b-batch-drift-02.csv",
    generator: () => batchDrift(2202, 2)
  },
  {
    id: "batch-drift-03",
    caseId: "case-b",
    caseName: "案例 B：批次製程漂移分析",
    title: "B3 氣體流量感測異常",
    difficulty: "中階",
    path: "datasets/intermediate/case-b-batch-drift-03.csv",
    generator: () => batchDrift(2203, 3)
  },
  {
    id: "inspection-quality-01",
    caseId: "case-c",
    caseName: "案例 C：檢測品質與複合指標分析",
    title: "C1 檢測工具偏移與複判時間",
    difficulty: "進階",
    path: "datasets/advanced/case-c-inspection-quality-01.csv",
    generator: () => inspectionQuality(3301, 1)
  },
  {
    id: "inspection-quality-02",
    caseId: "case-c",
    caseName: "案例 C：檢測品質與複合指標分析",
    title: "C2 疊對誤差與通過率變化",
    difficulty: "進階",
    path: "datasets/advanced/case-c-inspection-quality-02.csv",
    generator: () => inspectionQuality(3302, 2)
  },
  {
    id: "inspection-quality-03",
    caseId: "case-c",
    caseName: "案例 C：檢測品質與複合指標分析",
    title: "C3 粒子數異常與產品別比較",
    difficulty: "進階",
    path: "datasets/advanced/case-c-inspection-quality-03.csv",
    generator: () => inspectionQuality(3303, 3)
  }
];

await Promise.all(datasets.map(async (dataset) => {
  const fullPath = join(root, dataset.path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${dataset.generator()}\n`, "utf8");
}));

const catalog = datasets.map(({ generator, ...dataset }) => dataset);
const embedded = Object.fromEntries(datasets.map((dataset) => [dataset.id, dataset.generator()]));
const moduleText = `export const datasetCatalog = ${JSON.stringify(catalog, null, 2)};\n\nexport const embeddedDatasets = ${JSON.stringify(embedded, null, 2)};\n\nexport const sampleCsv = embeddedDatasets["equipment-yield-01"];\n`;
await writeFile(join(root, "frontend", "sample-data.mjs"), moduleText, "utf8");

const referenceLines = [
  "# 虛擬資料集索引",
  "",
  "本資料集皆為教學用模擬資料，不含真實製造資料。",
  "",
  "| 案例 | 資料集 | 難度 | 路徑 |",
  "|---|---|---|---|",
  ...catalog.map((dataset) => `| ${dataset.caseName} | ${dataset.title} | ${dataset.difficulty} | \`${dataset.path}\` |`),
  "",
  "每份資料都刻意包含部分不完美資料，例如缺值、重複列、非數值內容、類別命名不一致、日期格式混用或異常批次。"
];
await writeFile(join(root, "datasets", "reference", "dataset-index.md"), `${referenceLines.join("\n")}\n`, "utf8");

console.log(`Generated ${datasets.length} datasets.`);

