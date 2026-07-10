const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("scripts/dev-server.js", "utf8");
const gitignore = fs.readFileSync(".gitignore", "utf8");

assert(
  source.includes('const host = process.env.HOST || "0.0.0.0";') &&
    source.includes(".listen(port, host") &&
    source.includes('require("os")') &&
    source.includes("networkInterfaces") &&
    source.includes("LAN URL"),
  "dev server should listen on all interfaces and print the LAN URL hint"
);

assert(
  source.includes(".env.local") &&
    source.includes("ARK_API_KEY") &&
    source.includes('/dev/recommend-menu') &&
    source.includes("ark.cn-beijing.volces.com/api/v3/chat/completions"),
  "dev server should load ARK_API_KEY from .env.local and proxy local menu requests"
);

assert(
  source.includes("preferences") &&
    source.includes("cleanMenuPreferences") &&
    source.includes("soreThroat") &&
    source.includes("cough") &&
    source.includes("fever") &&
    source.includes("otherDiscomfort") &&
    source.includes("discomfortSymptoms") &&
    source.includes("不适症状"),
  "dev server should forward taste preferences and combined symptom notes into Ark menu prompts"
);

assert(
  gitignore.includes(".env.local"),
  ".env.local should be ignored so local API tokens do not enter git"
);

console.log("dev server tests passed");
