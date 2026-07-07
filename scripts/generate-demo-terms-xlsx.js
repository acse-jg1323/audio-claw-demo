const path = require("path");
const fs = require("fs");
const XLSX = require("../app/vendor/xlsx.full.min.js");

const headers = ["归属范围", "术语类型", "术语名称", "源语言", "源词", "别名", "目标语言", "处理方式", "译法", "备注"];

const rows = [
  ["企业共享", "固定译法", "神泉科技", "zh", "神泉科技", "神泉", "ja", "固定译法", "シェンチュアン", "品牌标准日文译法"],
  ["企业共享", "固定译法", "神泉科技", "zh", "神泉科技", "神泉", "en", "固定译法", "Shenchuan Technology", "品牌标准英文译法"],
  ["企业共享", "固定译法", "AudioClaw Pro", "en", "AudioClaw Pro", "", "ja", "固定译法", "オーディオクロー Pro", "产品名日文译法"],
  ["企业共享", "固定译法", "Enterprise Console", "en", "Enterprise Console", "", "zh", "固定译法", "企业控制台", "后台名称统一译法"],
  ["企业共享", "固定译法", "Enterprise Console", "en", "Enterprise Console", "", "ja", "固定译法", "エンタープライズコンソール", "后台名称统一译法"],
  ["企业共享", "识别热词", "POC", "en", "POC", "Proof of Concept", "zh", "固定译法", "概念验证", "销售场景常用缩写"],
  ["企业共享", "识别热词", "POC", "en", "POC", "Proof of Concept", "ja", "固定译法", "概念実証", "销售场景常用缩写"],
  ["企业共享", "识别热词", "APPI", "en", "APPI", "", "zh", "固定译法", "个人信息保护法", "日本合规术语"],
  ["企业共享", "识别热词", "APPI", "en", "APPI", "", "ja", "固定译法", "個人情報保護法", "日本合规术语"],
  ["企业共享", "固定译法", "サンライズ", "ja", "サンライズ", "", "zh", "保留原文", "", "客户公司名示例"],
];

const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
XLSX.utils.book_append_sheet(workbook, worksheet, "术语热词库");

const docsDir = path.resolve(__dirname, "../docs");
const xlsxPath = path.join(docsDir, "术语导入测试表.xlsx");
const csvPath = path.join(docsDir, "术语导入测试表-源数据.csv");

const xlsxBuffer = XLSX.write(workbook, {
  bookType: "xlsx",
  type: "buffer",
});
fs.writeFileSync(xlsxPath, xlsxBuffer);

const csvContent = [headers, ...rows]
  .map((row) =>
    row
      .map((item) => {
        const text = String(item ?? "");
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",")
  )
  .join("\n");

fs.writeFileSync(csvPath, csvContent, "utf8");

console.log(xlsxPath);
console.log(csvPath);
