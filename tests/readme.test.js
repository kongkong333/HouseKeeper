const assert = require("assert");
const fs = require("fs");

const readme = fs.readFileSync("README.md", "utf8");
const normalized = readme.toLowerCase();

assert(
  normalized.includes("different member accounts share the same household state") &&
    !readme.includes("one JSON state document per HouseKeeper account"),
  "README should document shared household data across separate member accounts"
);

console.log("README tests passed");
