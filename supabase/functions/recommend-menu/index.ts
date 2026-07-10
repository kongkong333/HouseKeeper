const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Ingredient = {
  name?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  expiryDate?: string;
  notes?: string;
};

type MenuPreferences = {
  taste?: string;
  symptoms?: {
    soreThroat?: boolean;
    cough?: boolean;
    fever?: boolean;
  };
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanIngredients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: Ingredient) => ({
      name: String(item?.name || "").trim(),
      quantity: Number(item?.quantity || 0),
      unit: String(item?.unit || "").trim(),
      location: String(item?.location || "").trim(),
      expiryDate: String(item?.expiryDate || "").trim(),
      notes: String(item?.notes || "").trim(),
    }))
    .filter((item) => item.name)
    .slice(0, 80);
}

function cleanMenuPreferences(value: MenuPreferences | undefined) {
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

function buildArkPayload(ingredients: ReturnType<typeof cleanIngredients>, preferences?: MenuPreferences) {
  const cleanPreferences = cleanMenuPreferences(preferences);
  return {
    model: "glm-5-2-260617",
    messages: [
      {
        role: "user",
        content: [
          "你是家庭厨房菜单推荐助手。",
          "请仅使用我提供的厨房材料推荐菜品，不要引入任何未列出的主料或配菜。",
          "调味品默认仅允许使用盐、糖、酱油、醋、食用油、葱姜蒜、胡椒。",
          "用户备注可能包含口味偏好和喉咙痛、咳嗽、发烧等身体不适；请据此选择更清淡、温和、少刺激的菜色，但不要给出医疗诊断或治疗承诺。",
          "请尽量给出多的菜品，返回 5-20 个可以制作的菜。",
          "同时返回一组推荐的健康菜品搭配，包含 2-3 个菜，并给出健康搭配理由。",
          "请返回严格 JSON，不要使用 Markdown。",
          "JSON 结构为：{\"dishes\":[{\"name\":\"菜名\",\"ingredients\":[\"材料\"],\"notes\":\"简短做法或提示\"}],\"healthyCombo\":{\"dishes\":[\"菜名\"],\"reason\":\"理由\"}}。",
          `厨房材料：${JSON.stringify(ingredients)}`,
          `用户备注：${JSON.stringify(cleanPreferences)}`,
        ].join("\n"),
      },
    ],
    max_tokens: 4096,
    temperature: 0.8,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const arkApiKey = Deno.env.get("ARK_API_KEY");
  if (!arkApiKey) {
    return jsonResponse({ error: "AI menu service is not configured" }, 500);
  }

  let body: { ingredients?: unknown; preferences?: MenuPreferences };
  try {
    body = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON request body" }, 400);
  }

  const ingredients = cleanIngredients(body.ingredients);
  if (!ingredients.length) {
    return jsonResponse({ error: "No eligible ingredients provided" }, 400);
  }

  const arkResponse = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${arkApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildArkPayload(ingredients, body.preferences)),
  });

  const arkText = await arkResponse.text();
  if (!arkResponse.ok) {
    console.error("Ark request failed", arkResponse.status, arkText);
    return jsonResponse({ error: "AI menu service request failed" }, 502);
  }

  let content = "";
  try {
    const arkData = JSON.parse(arkText);
    content = arkData?.choices?.[0]?.message?.content || "";
  } catch (_error) {
    content = arkText;
  }

  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return jsonResponse({ result: JSON.parse(cleaned) });
  } catch (_error) {
    return jsonResponse({ result: { rawText: cleaned || content } });
  }
});
