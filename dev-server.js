const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || "0.0.0.0";
const envPath = path.join(root, ".env.local");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function loadLocalEnv() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !(key in process.env)) process.env[key] = value;
  });
}

function cleanMenuPreferences(value) {
  const symptoms = value?.symptoms || {};
  return {
    taste: String(value?.taste || "").trim().slice(0, 120),
    symptoms: {
      soreThroat: Boolean(symptoms.soreThroat),
      cough: Boolean(symptoms.cough),
      fever: Boolean(symptoms.fever),
    },
  };
}

function buildArkMenuPayload(ingredients, preferences) {
  const cleanPreferences = cleanMenuPreferences(preferences);
  return {
    model: "glm-5-2-260617",
    messages: [
      {
        role: "user",
        content: [
          "你是家庭厨房菜单推荐助手。",
          "请仅使用我提供的厨房材料推荐菜品，不要引入任何未列出的主料和配菜。",
          "调味品默认仅允许使用盐、糖、酱油、醋、食用油、葱姜蒜、胡椒。",
          "若用户备注包含口味偏好（如清淡、少油、少辣等），应尽可能满足用户口味。",
          "若用户备注提及喉咙痛、咳嗽、发烧、感冒、胃口不好等身体不适，应优先推荐清淡、温和、少油、少刺激的菜品，但不要提供医疗诊断、治疗建议或疗效承诺。",
          "请尽量给出多的菜品，返回 5-20 个可以制作的菜。",
          "同时返回一组推荐的健康菜品搭配，包含 2-3 个菜，并从营养均衡/适配身体不适/适配口味等角度给出搭配理由。",
          "请返回严格 JSON，不要使用 Markdown。",
          "JSON 结构为：{\"dishes\":[{\"name\":\"菜名\",\"ingredients\":[\"材料\"],\"notes\":\"简短做法或提示\"}],\"healthyCombo\":{\"dishes\":[\"菜名\"],\"reason\":\"理由\"}}。",
          `厨房材料：${JSON.stringify(ingredients || [])}`,
          `用户备注：${JSON.stringify(cleanPreferences)}`,
        ].join("\n"),
      },
    ],
    max_tokens: 4096,
    temperature: 0.8,
  };
}

function parseMenuContent(content) {
  const text = String(content || "");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    return { rawText: cleaned || text };
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function handleDevMenuRequest(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  const arkKey = process.env.ARK_API_KEY;
  if (!arkKey) {
    sendJson(response, 500, { error: "ARK_API_KEY is not configured in .env.local" });
    return;
  }
  try {
    const body = await readJsonBody(request);
    const arkResponse = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${arkKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildArkMenuPayload(body.ingredients || [], body.preferences)),
    });
    const data = await arkResponse.json().catch(() => null);
    if (!arkResponse.ok) {
      sendJson(response, arkResponse.status, { error: data?.message || data?.error?.message || arkResponse.statusText });
      return;
    }
    sendJson(response, 200, { result: parseMenuContent(data?.choices?.[0]?.message?.content || "") });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "AI menu request failed" });
  }
}

loadLocalEnv();

http
  .createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/dev/recommend-menu") {
      handleDevMenuRequest(request, response);
      return;
    }
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(root, pathname));
    if (!file.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
      response.end(data);
    });
  })
  .listen(port, host, () => {
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((item) => item && item.family === "IPv4" && !item.internal)
      .map((item) => item.address);
    console.log(`HouseKeeper dev server: http://127.0.0.1:${port}`);
    addresses.forEach((address) => console.log(`LAN URL: http://${address}:${port}`));
  });
