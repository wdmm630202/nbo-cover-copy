const GEMINI_MODEL = "gemini-3-flash-preview";
const MAX_IMAGE_BASE64_LENGTH = 7000000;

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("NBO 灵感封面｜图片转热门文案")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
}

function verifyAccess(code) {
  const properties = PropertiesService.getScriptProperties();
  const expectedCode = properties.getProperty("ACCESS_CODE");
  const accessToken = properties.getProperty("ACCESS_TOKEN");

  if (!expectedCode || !accessToken || !safeEqual_(String(code || ""), expectedCode)) {
    return { ok: false };
  }

  return { ok: true, token: accessToken };
}

function analyzeImage(payload) {
  assertAccess_(payload);
  const image = parseImage_(payload.imageDataUrl);
  const brandNote = cleanText_(payload.brandNote, 120);
  const seed = Number(payload.seed || Date.now());

  const insight = callGeminiJson_(
    buildInsightPrompt_(brandNote),
    INSIGHT_SCHEMA,
    image,
    0.2,
  );
  const trend = collectPublicTrends_(insight.searchQueries || [], insight.keywords || []);
  const result = generateCopy_(insight, trend, brandNote, seed);

  return {
    ok: true,
    insight: {
      category: cleanText_(insight.category, 40),
      summary: cleanText_(insight.summary, 180),
      evidence: normalizeTextArray_(insight.evidence, 5, 24),
      keywords: normalizeTextArray_(insight.keywords, 8, 18),
      audience: cleanText_(insight.audience, 80),
    },
    trends: trend.terms,
    trendSource: trend.sources.join(" + "),
    trendTime: trend.time,
    sets: result.sets,
    context: {
      insight: insight,
      trends: trend,
      brandNote: brandNote,
    },
  };
}

function refreshCopy(payload) {
  assertAccess_(payload);
  if (!payload.context || !payload.context.insight || !payload.context.trends) {
    throw new Error("缺少上一次识别结果，请重新上传图片。");
  }

  const brandNote = cleanText_(payload.brandNote || payload.context.brandNote, 120);
  const seed = Number(payload.seed || Date.now());
  const result = generateCopy_(payload.context.insight, payload.context.trends, brandNote, seed);

  return {
    ok: true,
    sets: result.sets,
    context: {
      insight: payload.context.insight,
      trends: payload.context.trends,
      brandNote: brandNote,
    },
  };
}

function generateCopy_(insight, trend, brandNote, seed) {
  const prompt = buildCopyPrompt_(insight, trend, brandNote, seed);
  let result = callGeminiJson_(prompt, COPY_SCHEMA, null, 0.72);
  result = normalizeCopyResult_(result);

  if (!hasExactCoverLengths_(result)) {
    result = normalizeCopyResult_(
      callGeminiJson_(
        buildRepairPrompt_(result, insight, trend, brandNote, seed),
        COPY_SCHEMA,
        null,
        0.35,
      ),
    );
  }

  if (!hasExactCoverLengths_(result)) {
    throw new Error("本次标题字数校验未通过，请点击“换一批”重新生成。");
  }

  return result;
}

function callGeminiJson_(prompt, schema, image, temperature) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("AI 密钥尚未配置。");

  const parts = [{ text: prompt }];
  if (image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64,
      },
    });
  }

  const requestBody = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      temperature: temperature,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  const response = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(GEMINI_MODEL) +
      ":generateContent",
    {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": apiKey },
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true,
    },
  );

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    let detail = "AI 服务暂时不可用";
    try {
      const parsedError = JSON.parse(text);
      detail = parsedError.error && parsedError.error.message ? parsedError.error.message : detail;
    } catch (error) {
      // Keep the user-facing fallback message.
    }
    throw new Error(detail);
  }

  const data = JSON.parse(text);
  const output =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!output) throw new Error("AI 没有返回可用内容，请重新生成。");
  return JSON.parse(String(output).replace(/^```json\s*|\s*```$/g, ""));
}

function collectPublicTrends_(queries, fallbackKeywords) {
  const cleanQueries = normalizeTextArray_(queries, 3, 30);
  const requests = [];

  cleanQueries.forEach(function (query) {
    requests.push({
      url:
        "https://suggestqueries.google.com/complete/search?client=firefox&hl=zh-CN&q=" +
        encodeURIComponent(query),
      muteHttpExceptions: true,
      headers: { "User-Agent": "Mozilla/5.0 NBO-Cover-Copy/1.0" },
    });
    requests.push({
      url: "https://api.bing.com/osjson.aspx?query=" + encodeURIComponent(query),
      muteHttpExceptions: true,
      headers: { "User-Agent": "Mozilla/5.0 NBO-Cover-Copy/1.0" },
    });
  });

  const terms = [];
  const sources = [];

  if (requests.length) {
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function (response, index) {
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return;
      try {
        const parsed = JSON.parse(response.getContentText());
        const suggestions = Array.isArray(parsed[1]) ? parsed[1] : [];
        suggestions.forEach(function (item) {
          const value = typeof item === "string" ? item : item && item.phrase;
          const cleaned = cleanText_(value, 32);
          if (cleaned && cleaned.length >= 2 && terms.indexOf(cleaned) === -1) terms.push(cleaned);
        });
        const source = index % 2 === 0 ? "Google公开搜索联想" : "Bing公开搜索联想";
        if (suggestions.length && sources.indexOf(source) === -1) sources.push(source);
      } catch (error) {
        // Public suggestion endpoints can occasionally return a non-JSON response.
      }
    });
  }

  normalizeTextArray_(fallbackKeywords, 8, 18).forEach(function (item) {
    if (terms.indexOf(item) === -1) terms.push(item);
  });

  return {
    terms: terms.slice(0, 12),
    sources: sources.length ? sources : ["图片语义相关词"],
    time: Utilities.formatDate(new Date(), "Asia/Shanghai", "yyyy-MM-dd HH:mm"),
  };
}

function buildInsightPrompt_(brandNote) {
  return [
    "你是最严谨的中文图片内容分析员。只根据上传图片中真实可见的证据判断，不要套用固定行业模板。",
    "必须先判断图片到底是：男士写真、女士写真、珠宝首饰、服装、美食、产品静物、风景、空间、活动或其他。",
    "如果图片不是男士写真，禁止写男士、摄影师引导、写真套餐等无关内容。",
    "禁止猜测图片中看不见的品牌、价格、城市、材质证书、人物身份和促销信息。",
    "summary 要具体写出主体、颜色、构图、光线、氛围和可发布角度。",
    "evidence 只列真实可见的画面证据。",
    "keywords 是图片内容相关的中文关键词。",
    "searchQueries 给出 3 个适合查询当下公开搜索联想的中文短语。",
    "audience 写最可能对此内容感兴趣的人群，但不要过度推断。",
    "账号补充要求：" + (brandNote || "根据图片真实内容自动匹配"),
  ].join("\n");
}

function buildCopyPrompt_(insight, trend, brandNote, seed) {
  return [
    "你是中文社交媒体前沿文案工具，负责小红书、抖音、视频号。",
    "图片理解：" + JSON.stringify(insight),
    "当前公开搜索联想词：" + JSON.stringify(trend.terms || []),
    "趋势来源：" + JSON.stringify(trend.sources || []) + "，采集时间：" + String(trend.time || ""),
    "账号补充要求：" + (brandNote || "根据图片真实内容自动匹配"),
    "本次创意种子：" + String(seed),
    "",
    "请生成恰好 3 组不同角度的高意向发布方案，并按用户最可能想咨询、收藏或互动的顺序打分。",
    "硬性规则：",
    "1. top 必须恰好 7 个中文字符，bottom 必须恰好 8 个中文字符；不含空格、标点、英文和数字。",
    "2. 7+8 合计固定 15 字，必须自然、具体、有画面钩子，不能像通用鸡汤。",
    "3. 文案必须与图片主体一致。珠宝就写珠宝，风景就写风景，人物就写人物；禁止货不对版。",
    "4. 只有图片明确是男士写真时，才可使用“明码实价、拍得明白、自然引导、真实耐看”等南铂定位。",
    "5. 不得捏造品牌、价格、优惠、城市、稀缺性、功效、材质证书或图片中没有的事实。",
    "6. 公开搜索联想只用于选题方向，不得伪装成小红书或抖音官方热榜。",
    "7. 每组提供小红书、抖音、视频号三套正文；小红书 120-220 字，抖音 45-90 字，视频号 70-130 字。",
    "8. 每组给 6 个 #话题，优先图片精准词和当前公开联想词；不要堆无关大词。",
    "9. eyebrow 是简短的意向判断，reason 解释为什么适合这张图。",
    "10. 三组角度要明显不同：咨询转化、收藏价值、情绪互动各有侧重。",
  ].join("\n");
}

function buildRepairPrompt_(result, insight, trend, brandNote, seed) {
  return [
    "下面结果未通过固定字数校验，请完整重写为 3 组。",
    "每组 top 恰好 7 个中文字符，bottom 恰好 8 个中文字符；不含空格、标点、英文和数字。",
    "必须继续严格匹配图片真实内容，不得捏造。",
    "图片理解：" + JSON.stringify(insight),
    "公开搜索联想：" + JSON.stringify(trend.terms || []),
    "账号要求：" + (brandNote || "根据图片真实内容自动匹配"),
    "创意种子：" + String(seed + 17),
    "待修正结果：" + JSON.stringify(result),
  ].join("\n");
}

function normalizeCopyResult_(result) {
  if (!result || !Array.isArray(result.sets) || result.sets.length !== 3) {
    throw new Error("AI 返回结构不完整，请重新生成。");
  }

  const sets = result.sets.map(function (item, index) {
    const bodies = item.bodies || {};
    return {
      eyebrow: cleanText_(item.eyebrow, 20) || ["咨询意向高", "收藏价值高", "互动共鸣高"][index],
      top: cleanCover_(item.top),
      bottom: cleanCover_(item.bottom),
      reason: cleanText_(item.reason, 100),
      score: Math.max(70, Math.min(99, Number(item.score || 90 - index * 2))),
      bodies: {
        小红书: cleanText_(bodies["小红书"], 500),
        抖音: cleanText_(bodies["抖音"], 220),
        视频号: cleanText_(bodies["视频号"], 320),
      },
      tags: normalizeTextArray_(item.tags, 6, 22).map(function (tag) {
        return tag.charAt(0) === "#" ? tag : "#" + tag;
      }),
    };
  });

  return { sets: sets };
}

function hasExactCoverLengths_(result) {
  return result.sets.every(function (item) {
    return codePointLength_(item.top) === 7 && codePointLength_(item.bottom) === 8;
  });
}

function parseImage_(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("图片格式不支持，请上传 JPG、PNG 或 WEBP。");
  if (match[2].length > MAX_IMAGE_BASE64_LENGTH) throw new Error("图片过大，请重新选择。");
  return { mimeType: match[1], base64: match[2] };
}

function assertAccess_(payload) {
  const expected = PropertiesService.getScriptProperties().getProperty("ACCESS_TOKEN");
  if (!payload || !expected || !safeEqual_(String(payload.accessToken || ""), expected)) {
    throw new Error("访问验证已失效，请重新输入密码。");
  }
}

function safeEqual_(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function cleanCover_(value) {
  return String(value || "").replace(/[\s\p{P}\p{S}\p{N}A-Za-z]/gu, "");
}

function cleanText_(value, maxLength) {
  return Array.from(String(value || "").trim()).slice(0, maxLength).join("");
}

function normalizeTextArray_(value, limit, maxLength) {
  if (!Array.isArray(value)) return [];
  const output = [];
  value.forEach(function (item) {
    const cleaned = cleanText_(item, maxLength);
    if (cleaned && output.indexOf(cleaned) === -1) output.push(cleaned);
  });
  return output.slice(0, limit);
}

function codePointLength_(value) {
  return Array.from(String(value || "")).length;
}

const INSIGHT_SCHEMA = {
  type: "OBJECT",
  required: ["category", "summary", "evidence", "keywords", "searchQueries", "audience"],
  properties: {
    category: { type: "STRING" },
    summary: { type: "STRING" },
    evidence: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 5 },
    keywords: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 8 },
    searchQueries: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
    audience: { type: "STRING" },
  },
};

const COPY_SCHEMA = {
  type: "OBJECT",
  required: ["sets"],
  properties: {
    sets: {
      type: "ARRAY",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "OBJECT",
        required: ["eyebrow", "top", "bottom", "reason", "score", "bodies", "tags"],
        properties: {
          eyebrow: { type: "STRING" },
          top: { type: "STRING" },
          bottom: { type: "STRING" },
          reason: { type: "STRING" },
          score: { type: "INTEGER", minimum: 70, maximum: 99 },
          bodies: {
            type: "OBJECT",
            required: ["小红书", "抖音", "视频号"],
            properties: {
              小红书: { type: "STRING" },
              抖音: { type: "STRING" },
              视频号: { type: "STRING" },
            },
          },
          tags: {
            type: "ARRAY",
            items: { type: "STRING" },
            minItems: 6,
            maxItems: 6,
          },
        },
      },
    },
  },
};
