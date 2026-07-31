const GEMINI_INSIGHT_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
];
const GEMINI_COPY_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];
const GEMINI_RETRY_ROUNDS = 2;
const MAX_IMAGE_BASE64_LENGTH = 7000000;
const TREND_CACHE_SECONDS = 600;
const VIRAL_CANDIDATE_COUNT = 12;
const ANALYSIS_JOB_CACHE_SECONDS = 1800;
const ANALYSIS_JOB_CHUNK_SIZE = 24000;

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("NBO 灵感封面｜图片转热门文案")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
  try {
    assertAccess_(payload);
    const image = parseImage_(payload.imageDataUrl);
    const brandNote = cleanText_(payload.brandNote, 120);
    const seed = Number(payload.seed || Date.now());
    const coverConfig = normalizeCoverConfig_(payload.coverConfig);

    const insight = callGeminiJson_(
      buildInsightPrompt_(brandNote),
      INSIGHT_SCHEMA,
      image,
      GEMINI_INSIGHT_MODELS,
      2048,
      { thinkingLevel: "minimal", temperature: 0.2 }
    );
    const trend = collectPublicTrends_(insight.searchQueries || [], insight.keywords || []);
    const result = generateCopy_(insight, trend, brandNote, seed, coverConfig);

    return {
      ok: true,
      insight: {
        category: cleanText_(insight.category, 40),
        summary: cleanText_(insight.summary, 180),
        evidence: normalizeTextArray_(insight.evidence, 5, 24),
        keywords: normalizeTextArray_(insight.keywords, 8, 18),
        audience: cleanText_(insight.audience, 80),
        contentOpportunity: cleanText_(insight.contentOpportunity, 100),
        emotionalTone: cleanText_(insight.emotionalTone, 40),
      },
      trends: trend.terms,
      trendSource: trend.sources.join(" + "),
      trendTime: trend.time,
      strategyMeta: buildStrategyMeta_(trend, result.coverConfig),
      coverConfig: result.coverConfig,
      sets: result.sets,
      context: {
        insight: insight,
        trends: trend,
        brandNote: brandNote,
        coverConfig: result.coverConfig,
      },
    };
  } catch (error) {
    throw new Error(toChineseError_(error));
  }
}

function analyzeImageJob(payload) {
  assertAccess_(payload);
  const jobId = normalizeAnalysisJobId_(payload.jobId);
  writeAnalysisJob_(jobId, {
    status: "running",
    updatedAt: new Date().toISOString(),
  });

  try {
    const result = analyzeImage(payload);
    const current = readAnalysisJob_(jobId);
    if (current && current.status === "cancelled") {
      return { status: "cancelled", jobId: jobId };
    }

    const completed = {
      status: "succeeded",
      jobId: jobId,
      result: result,
      updatedAt: new Date().toISOString(),
    };
    writeAnalysisJob_(jobId, completed);
    return completed;
  } catch (error) {
    const current = readAnalysisJob_(jobId);
    if (current && current.status === "cancelled") {
      return { status: "cancelled", jobId: jobId };
    }

    const message = toChineseError_(error);
    writeAnalysisJob_(jobId, {
      status: "failed",
      jobId: jobId,
      message: message,
      updatedAt: new Date().toISOString(),
    });
    throw new Error(message);
  }
}

function getAnalysisJobStatus(payload) {
  assertAccess_(payload);
  const jobId = normalizeAnalysisJobId_(payload.jobId);
  return readAnalysisJob_(jobId) || {
    status: "pending",
    jobId: jobId,
  };
}

function cancelAnalysisJob(payload) {
  assertAccess_(payload);
  const jobId = normalizeAnalysisJobId_(payload.jobId);
  writeAnalysisJob_(jobId, {
    status: "cancelled",
    jobId: jobId,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

function normalizeAnalysisJobId_(value) {
  const jobId = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
  if (jobId.length < 12) {
    throw new Error("任务编号无效，请重新开始识别。");
  }
  return jobId;
}

function analysisJobCacheKey_(jobId) {
  return "nbo_analysis_job_" + jobId;
}

function writeAnalysisJob_(jobId, value) {
  const cache = CacheService.getScriptCache();
  const key = analysisJobCacheKey_(jobId);
  const serialized = JSON.stringify(value);
  const chunks = Math.max(1, Math.ceil(serialized.length / ANALYSIS_JOB_CHUNK_SIZE));
  const entries = {};

  entries[key + "_meta"] = JSON.stringify({ chunks: chunks });
  for (let index = 0; index < chunks; index += 1) {
    entries[key + "_" + index] = serialized.slice(
      index * ANALYSIS_JOB_CHUNK_SIZE,
      (index + 1) * ANALYSIS_JOB_CHUNK_SIZE,
    );
  }
  cache.putAll(entries, ANALYSIS_JOB_CACHE_SECONDS);
}

function readAnalysisJob_(jobId) {
  const cache = CacheService.getScriptCache();
  const key = analysisJobCacheKey_(jobId);
  const metaRaw = cache.get(key + "_meta");
  if (!metaRaw) return null;

  try {
    const meta = JSON.parse(metaRaw);
    const chunkCount = Math.max(1, Number(meta.chunks || 1));
    const keys = [];
    for (let index = 0; index < chunkCount; index += 1) {
      keys.push(key + "_" + index);
    }
    const values = cache.getAll(keys);
    const serialized = keys.map((chunkKey) => values[chunkKey] || "").join("");
    return serialized ? JSON.parse(serialized) : null;
  } catch (error) {
    return null;
  }
}

function refreshCopy(payload) {
  try {
    assertAccess_(payload);
    if (!payload.context || !payload.context.insight || !payload.context.trends) {
      throw new Error("缺少上一次识别结果，请重新上传图片。");
    }

    const brandNote = cleanText_(payload.brandNote || payload.context.brandNote, 120);
    const seed = Number(payload.seed || Date.now());
    const coverConfig = normalizeCoverConfig_(
      payload.coverConfig || payload.context.coverConfig,
    );
    const trend = collectPublicTrends_(
      payload.context.insight.searchQueries || [],
      payload.context.insight.keywords || [],
    );
    const result = generateCopy_(
      payload.context.insight,
      trend,
      brandNote,
      seed,
      coverConfig,
    );

    return {
      ok: true,
      sets: result.sets,
      trends: trend.terms,
      trendSource: trend.sources.join(" + "),
      trendTime: trend.time,
      strategyMeta: buildStrategyMeta_(trend, result.coverConfig),
      coverConfig: result.coverConfig,
      context: {
        insight: payload.context.insight,
        trends: trend,
        brandNote: brandNote,
        coverConfig: result.coverConfig,
      },
    };
  } catch (error) {
    throw new Error(toChineseError_(error));
  }
}

function generateCopy_(insight, trend, brandNote, seed, coverConfig) {
  const normalizedCoverConfig = normalizeCoverConfig_(coverConfig);
  const prompt = buildCopyPrompt_(
    insight,
    trend,
    brandNote,
    seed,
    normalizedCoverConfig,
  );
  let result = normalizeCopyResult_(
    callGeminiJson_(
      prompt,
      COPY_SCHEMA,
      null,
      GEMINI_COPY_MODELS,
      8192,
      { thinkingLevel: "low", temperature: 0.9 },
    )
  );
  const issues = getCopyValidationIssues_(result, normalizedCoverConfig);

  if (issues.length) {
    logCopyRepair_("检测到缺项，立即转为本地补全", issues);
  }

  result = finalizeCopyResult_(
    result,
    insight,
    trend,
    normalizedCoverConfig,
  );
  const finalIssues = getCopyValidationIssues_(result, normalizedCoverConfig);
  if (finalIssues.length) {
    logCopyRepair_("最终结果仍有缺项", finalIssues);
  }

  return result;
}

function callGeminiJson_(prompt, schema, image, modelOrder, maxOutputTokens, options) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("智能服务尚未完成后台配置。");
  const models = Array.isArray(modelOrder) && modelOrder.length
    ? modelOrder
    : GEMINI_COPY_MODELS;

  const parts = [{ text: prompt }];
  if (image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64,
      },
    });
  }

  const generationOptions = options || {};
  const requestBody = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      thinkingConfig: {
        thinkingLevel: generationOptions.thinkingLevel || "minimal",
      },
      temperature: Number(
        typeof generationOptions.temperature === "number"
          ? generationOptions.temperature
          : 0.4,
      ),
      maxOutputTokens: Number(maxOutputTokens || 8192),
    },
  };

  let lastStatus = 0;
  let lastDetail = "";

  for (let attempt = 0; attempt < GEMINI_RETRY_ROUNDS; attempt += 1) {
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex];
      let response;
      try {
        response = UrlFetchApp.fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(model) +
            ":generateContent",
          {
            method: "post",
            contentType: "application/json",
            headers: { "x-goog-api-key": apiKey },
            payload: JSON.stringify(requestBody),
            muteHttpExceptions: true,
          },
        );
      } catch (error) {
        lastStatus = 0;
        lastDetail = error && error.message ? error.message : String(error || "");
        if (modelIndex + 1 === models.length && attempt + 1 < GEMINI_RETRY_ROUNDS) {
          sleepBeforeRetry_(attempt, modelIndex);
        }
        continue;
      }

      const status = response.getResponseCode();
      const text = response.getContentText();
      if (status >= 200 && status < 300) {
        try {
          return parseGeminiJson_(text);
        } catch (error) {
          lastStatus = 502;
          lastDetail = error && error.message ? error.message : String(error || "");
          if (modelIndex + 1 === models.length && attempt + 1 < GEMINI_RETRY_ROUNDS) {
            sleepBeforeRetry_(attempt, modelIndex);
          }
          continue;
        }
      }

      let detail = "";
      try {
        const parsedError = JSON.parse(text);
        detail = parsedError.error && parsedError.error.message ? parsedError.error.message : detail;
      } catch (error) {
        detail = text;
      }

      if (!isRetryableGeminiError_(status, detail)) {
        logGeminiFailure_(model, status, detail);
        throw new Error(toChineseError_(detail, status));
      }

      lastStatus = status;
      lastDetail = detail;
      if (modelIndex + 1 === models.length && attempt + 1 < GEMINI_RETRY_ROUNDS) {
        sleepBeforeRetry_(attempt, modelIndex);
      }
    }
  }

  if (
    lastStatus === 429 ||
    /quota|rate limit|resource exhausted|too many requests/i.test(lastDetail)
  ) {
    throw new Error("免费使用额度暂时达到上限，系统已经自动尝试稳定服务和备用服务。请稍后再试。");
  }
  throw new Error("稳定服务和备用服务目前都比较繁忙，系统已经自动重试。请等待几分钟后再试。");
}

function logGeminiFailure_(model, status, detail) {
  console.error(
    JSON.stringify({
      stage: "Gemini接口请求",
      model: String(model || ""),
      status: Number(status || 0),
      detail: String(detail || "").slice(0, 1200),
    }),
  );
}

function diagnoseGeminiService() {
  return callGeminiJson_(
    "请严格返回一个JSON对象，category写测试，summary写连接正常，evidence和keywords各写两个中文词，searchQueries写四个中文短语，audience、contentOpportunity、emotionalTone均写简短中文。",
    INSIGHT_SCHEMA,
    null
  );
}

function diagnoseTrendService() {
  const result = collectPublicTrends_(
    ["男士写真", "男士写真怎么拍", "男士写真风格", "男士写真本月新需求"],
    ["男士写真", "自然引导", "明码实价"],
  );
  console.log(JSON.stringify(result));
  return result;
}

function parseGeminiJson_(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("智能服务返回的数据无法读取，请点击“重新尝试”。");
  }
  const output =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!output) throw new Error("智能服务没有返回可用内容，请点击“重新尝试”。");
  try {
    return JSON.parse(String(output).replace(/^```json\s*|\s*```$/g, ""));
  } catch (error) {
    throw new Error("智能服务返回的内容格式不完整，请点击“重新尝试”。");
  }
}

function isRetryableGeminiError_(statusCode, detail) {
  const status = Number(statusCode || 0);
  const normalized = String(detail || "").toLowerCase();
  return (
    status === 0 ||
    status === 408 ||
    status === 429 ||
    (status === 404 &&
      /model|no longer available|not available|not found|new users/.test(normalized)) ||
    status >= 500 ||
    /high demand|overload|timeout|timed out|deadline|network|connection|temporarily unavailable/.test(normalized)
  );
}

function sleepBeforeRetry_(attempt, modelIndex) {
  const baseDelay = (attempt + 1) * 900 + modelIndex * 700;
  const jitter = Math.floor(Math.random() * 450);
  Utilities.sleep(baseDelay + jitter);
}

function toChineseError_(error, statusCode) {
  const raw = String(
    error && typeof error === "object" && error.message ? error.message : error || "",
  ).replace(/^Error:\s*/i, "").trim();
  const normalized = raw.toLowerCase();
  const status = Number(statusCode || 0);

  if (
    status === 429 ||
    /high demand|overload|too many requests|resource exhausted|quota|rate limit/.test(normalized)
  ) {
    return "免费使用额度暂时达到上限，系统已经自动尝试稳定服务和备用服务。请稍后再试。";
  }
  if (
    status === 404 &&
    /model|no longer available|not available|not found|new users/.test(normalized)
  ) {
    return "免费智能模型正在更新，系统已经自动尝试备用服务。请稍后重新尝试。";
  }
  if (
    status === 408 ||
    /timeout|timed out|deadline exceeded|time limit/.test(normalized)
  ) {
    return "本次连接等待时间过长，任务已经安全停止。请检查网络后点击“重新尝试”。";
  }
  if (
    /network|failed to fetch|connection|socket|dns|internet|offline/.test(normalized)
  ) {
    return "当前网络连接不稳定，图片和错误结果都不会被采用。请检查网络后重新尝试。";
  }
  if (
    status === 401 ||
    status === 403 ||
    /api key|unauthorized|permission denied|forbidden|authentication/.test(normalized)
  ) {
    return "智能服务授权暂时失效，请联系管理员检查后台设置。";
  }
  if (
    /safety|blocked|prohibited|policy|content filter/.test(normalized)
  ) {
    return "这张图片或本次文字触发了内容安全检查，请更换图片或调整补充要求后重试。";
  }
  if (
    status >= 500 ||
    /internal error|server error|service unavailable|temporarily unavailable/.test(normalized)
  ) {
    return "智能服务暂时出现异常，任务已经安全停止。请稍后点击“重新尝试”。";
  }
  if (/[\u4e00-\u9fff]/.test(raw) && !/[A-Za-z]/.test(raw)) {
    return raw;
  }
  return "系统暂时出现异常，本次结果不会被采用。请稍后点击“重新尝试”。";
}

function collectPublicTrends_(queries, fallbackKeywords) {
  const cleanQueries = buildTrendQueries_(queries);
  const cache = CacheService.getScriptCache();
  const cacheKey = buildTrendCacheKey_(cleanQueries);
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      // Ignore malformed cache data and collect a fresh set of signals.
    }
  }

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
    requests.push({
      url:
        "https://www.baidu.com/sugrec?prod=pc&wd=" +
        encodeURIComponent(query),
      muteHttpExceptions: true,
      headers: { "User-Agent": "Mozilla/5.0 NBO-Cover-Copy/1.0" },
    });
  });

  const signalMap = {};
  const sources = [];

  if (requests.length) {
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function (response, index) {
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return;
      try {
        const engineIndex = index % 3;
        const suggestions = parseTrendSuggestions_(
          response.getContentText(),
          engineIndex,
        );
        const source = [
          "Google公开搜索联想",
          "Bing公开搜索联想",
          "百度公开搜索联想",
        ][engineIndex];
        suggestions.slice(0, 10).forEach(function (item, rank) {
          addTrendSignal_(signalMap, item, source, rank, false);
        });
        if (suggestions.length && sources.indexOf(source) === -1) sources.push(source);
      } catch (error) {
        // Public suggestion endpoints can occasionally return a non-JSON response.
      }
    });
  }

  normalizeTextArray_(fallbackKeywords, 8, 18).forEach(function (item) {
    addTrendSignal_(signalMap, item, "图片语义相关词", 10, true);
  });

  const rankedTerms = Object.keys(signalMap)
    .map(function (key) {
      const item = signalMap[key];
      item.totalScore = item.score + item.sources.length * 10;
      return item;
    })
    .sort(function (left, right) {
      if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;
      return left.value.localeCompare(right.value, "zh-CN");
    })
    .slice(0, 15)
    .map(function (item) {
      return item.value;
    });

  const collectedAt = new Date();
  const result = {
    terms: rankedTerms,
    sources: sources.length ? sources : ["图片语义相关词"],
    time: Utilities.formatDate(collectedAt, "Asia/Shanghai", "yyyy-MM-dd HH:mm"),
    collectedAt: collectedAt.toISOString(),
    freshness: "本次生成前现查，最多缓存10分钟",
    queryScope: "品类、用户问题、画面风格、当月需求及三平台相关表达",
  };

  cache.put(cacheKey, JSON.stringify(result), TREND_CACHE_SECONDS);
  return result;
}

function buildTrendQueries_(queries) {
  const baseQueries = normalizeTextArray_(queries, 4, 30);
  const categoryQuery = baseQueries[0] || "";
  return normalizeTextArray_(
    baseQueries.concat(
      categoryQuery
        ? [
            categoryQuery + " 小红书",
            categoryQuery + " 抖音",
            categoryQuery + " 视频号",
          ]
        : [],
    ),
    7,
    36,
  );
}

function buildTrendCacheKey_(queries) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(queries || []),
    Utilities.Charset.UTF_8,
  );
  const encoded = Utilities.base64EncodeWebSafe(digest)
    .replace(/=+$/g, "")
    .slice(0, 36);
  return "nbo_trend_v2_" + encoded;
}

function parseTrendSuggestions_(text, engineIndex) {
  const parsed = JSON.parse(String(text || ""));
  if (engineIndex === 2) {
    return (Array.isArray(parsed.g) ? parsed.g : [])
      .map(function (item) {
        return item && item.q;
      })
      .filter(Boolean);
  }
  return Array.isArray(parsed[1])
    ? parsed[1].map(function (item) {
        return typeof item === "string" ? item : item && item.phrase;
      }).filter(Boolean)
    : [];
}

function addTrendSignal_(signalMap, value, source, rank, isFallback) {
  const cleaned = cleanText_(value, 36)
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || codePointLength_(cleaned) < 2) return;

  const key = cleaned.toLowerCase();
  if (!signalMap[key]) {
    signalMap[key] = {
      value: cleaned,
      score: 0,
      sources: [],
    };
  }

  const item = signalMap[key];
  item.score += isFallback
    ? 3
    : 22 + Math.max(0, 10 - Number(rank || 0)) * 2;
  if (/2026|今年|最近|最新|本月|当下|趋势|新/.test(cleaned)) {
    item.score += 6;
  }
  if (item.sources.indexOf(source) === -1) item.sources.push(source);
}

function normalizeCoverConfig_(value) {
  const source = value || {};
  const mode = source.mode === "manual" ? "manual" : "smart";
  const requestedTop = Number(source.topLength);
  const requestedBottom = Number(source.bottomLength);
  const topLength = Number.isFinite(requestedTop)
    ? Math.max(3, Math.min(16, requestedTop))
    : 7;
  const bottomLength = Number.isFinite(requestedBottom)
    ? Math.max(3, Math.min(16, requestedBottom))
    : 8;
  return {
    mode: mode,
    topLength: Math.round(topLength),
    bottomLength: Math.round(bottomLength),
  };
}

function buildStrategyMeta_(trend, coverConfig) {
  const normalizedCoverConfig = normalizeCoverConfig_(coverConfig);
  const coverDecision = normalizedCoverConfig.mode === "manual"
    ? "已按你的明确设置生成：上行" +
      normalizedCoverConfig.topLength +
      "字，下行" +
      normalizedCoverConfig.bottomLength +
      "字。"
    : "智能推荐为首选：不预设固定字数，按画面信息量、当前表达趋势、封面阅读速度和平台受众自动决定每行长度。";
  return {
    mode: "全网公开信号智能决策",
    candidateCount: VIRAL_CANDIDATE_COUNT,
    selectedCount: 3,
    coverMode: normalizedCoverConfig.mode,
    coverDecision: coverDecision,
    freshness: trend && trend.freshness
      ? trend.freshness
      : "本次生成前采集公开信号",
    selection:
      "同时分析图片事实、跨搜索来源共识、平台相关表达和当前用户需求；先发散12个创意角度，再按数据表现筛出3组。",
    guardrail:
      "运营者个人情绪和审美偏好不能覆盖图片与数据；过时套话、单一来源信号和无关热词自动降权。",
  };
}

function buildInsightPrompt_(brandNote) {
  const currentTime = Utilities.formatDate(
    new Date(),
    "Asia/Shanghai",
    "yyyy-MM-dd HH:mm",
  );
  return [
    "你是最严谨的中文图片内容分析员。只根据上传图片中真实可见的证据判断，不要套用固定行业模板。",
    "当前北京时间：" + currentTime + "。后续搜索词必须服务于当下选题，不要依赖过期案例。",
    "必须先判断图片到底是：男士写真、女士写真、珠宝首饰、服装、美食、产品静物、风景、空间、活动或其他。",
    "如果图片不是男士写真，禁止写男士、摄影师引导、写真套餐等无关内容。",
    "禁止猜测图片中看不见的品牌、价格、城市、材质证书、人物身份和促销信息。",
    "summary 要具体写出主体、颜色、构图、光线、氛围和可发布角度。",
    "evidence 只列真实可见的画面证据。",
    "keywords 是图片内容相关的中文关键词。",
    "searchQueries 给出 4 个用于本次实时查询的中文短语：品类核心词、用户真实问题、画面风格或场景词、当月新需求词各1个。不要四条都写成宽泛大词。",
    "audience 写最可能对此内容感兴趣的人群，但不要过度推断。",
    "contentOpportunity 写这张图最值得放大的传播机会，例如悬念、反差、审美、知识、信任、避坑或购买灵感；必须基于图片。",
    "emotionalTone 写画面真实情绪，如克制、自信、松弛、治愈、精致、热闹或专业。",
    "事实补充：" + (brandNote || "无。完全根据图片与当前公开信号判断"),
    "事实补充只用于确认图片外但可验证的信息，不能把运营者的个人情绪、审美偏好或主观想法当成传播结论。",
  ].join("\n");
}

function buildCopyPrompt_(insight, trend, brandNote, seed, coverConfig) {
  const currentTime = Utilities.formatDate(
    new Date(),
    "Asia/Shanghai",
    "yyyy-MM-dd HH:mm",
  );
  const normalizedCoverConfig = normalizeCoverConfig_(coverConfig);
  const coverRules = normalizedCoverConfig.mode === "manual"
    ? [
        "1. 本次由用户明确设置字数：top 必须恰好 " +
          normalizedCoverConfig.topLength +
          " 个中文字符，bottom 必须恰好 " +
          normalizedCoverConfig.bottomLength +
          " 个中文字符；不含空格、标点、英文和数字。",
        "2. 手动字数只是排版要求，具体措辞仍必须由图片事实、当前数据和平台受众决定，不能沿用运营者个人情绪。",
      ]
    : [
        "1. 本次使用智能推荐字数。禁止为了统一排版硬凑7+8；top 和 bottom 各自可在4至14个中文字符之间自由决定，三组也可以采用不同长度。",
        "2. 每组字数必须由画面信息密度、当前高相关表达、封面一眼可读性和目标受众共同决定。表达完整优先，能短则短，需要信息量时可以更长。",
      ];
  return [
    "你是中文社交媒体前沿内容策略师，负责小红书、抖音、视频号。你的任务不是套爆款公式，而是用当前信号判断这张图片此刻最值得怎么发。",
    "当前北京时间：" + currentTime + "。模型记忆中的旧案例只能作背景，不能覆盖本次实时采集结果。",
    "图片理解：" + JSON.stringify(insight),
    "当前公开搜索联想词：" + JSON.stringify(trend.terms || []),
    "趋势来源：" + JSON.stringify(trend.sources || []) + "，采集时间：" + String(trend.time || ""),
    "趋势时效说明：" + String(trend.freshness || "本次生成前采集"),
    "可验证事实补充：" + (brandNote || "无"),
    "本次创意种子：" + String(seed),
    "",
    "在内部先完成以下创意筛选，但不要输出中间过程：",
    "A. 围绕图片真实证据、用户未满足需求和当前公开信号，发散恰好12个不同创意角度；角度要覆盖反常识、细节发现、决策帮助、真实证明、身份共鸣、结果想象、问题解决等不同机制。",
    "B. 淘汰货不对版、无事实支撑、只换同义词、追无关热点、与三平台受众不匹配以及已经审美疲劳的角度。",
    "C. 按图片相关性30分、跨来源数据与新鲜度20分、平台匹配20分、用户价值15分、互动或咨询潜力10分、事实安全5分进行比较。多来源共同出现的需求高于单一来源词，真实搜索意图高于流行口号。",
    "D. 最终只返回综合分最高且钩子机制明显不同的3组，并按潜力从高到低排列。爆款只代表高概率思维，禁止承诺一定爆。",
    "E. 画面情绪只是一项可见证据，不得直接沿用运营者、博主或客户的个人情感。主观补充不能推翻图片、实时数据和平台受众共同得出的结论。",
    "硬性规则：",
    coverRules[0],
    coverRules[1],
    "3. 文案必须与图片主体一致。珠宝就写珠宝，风景就写风景，人物就写人物；禁止货不对版。",
    "4. 只有图片明确是男士写真时，才可使用“明码实价、拍得明白、自然引导、真实耐看”等南铂定位。",
    "5. 不得捏造品牌、价格、优惠、城市、稀缺性、功效、材质证书或图片中没有的事实。",
    "6. 公开搜索联想只用于选题方向，不得伪装成小红书或抖音官方热榜。一个热词只有与图片至少一半内容强相关时才可采用；不相关就舍弃。",
    "7. 每组都要分别生成小红书、抖音、视频号的 title、description、topics、audience、hook、strategy，三个平台禁止使用同一套标题或描述。",
    "8. 小红书：title 最多20个字符，偏搜索、收藏、经验分享或决策帮助；description 建议180-420字，像真实笔记；topics 5-8个。",
    "9. 抖音：title 最多30个字符，前半句必须快速抓人；description 建议60-180字，短句、有节奏、可有一个明确互动或咨询动作；topics 3-5个。",
    "10. 视频号：title 最多30个字符，可信、克制、适合熟人社交传播；description 建议80-220字，重真实感、价值或观点；topics 2-4个。",
    "11. 表情符号按内容决定，不是必加项。生活化、情绪化内容可在标题或描述少量使用；商务、极简、严肃画面可以完全不用。每个标题最多1个表情，描述最多3个，禁止表情堆砌。",
    "12. hook 必须写明采用的钩子手段，例如悬念、反差、痛点、结果前置、清单、情绪共鸣、审美冲击、信任证明或购买灵感；必须与图片和平台人群匹配。",
    "13. audience 写该平台最可能停留的人群，strategy 用一句话解释为什么这样写，不要说空泛的“增加曝光”。",
    "14. topics 优先图片精准词、用户搜索词和公开联想词，不堆砌无关大词，每个词都以#开头。",
    "15. eyebrow 是简短的传播角度，reason 解释为什么适合这张图。三组角度必须明显不同，不得只是换同义词。",
    "16. 小红书优先考虑真实搜索需求、收藏价值和决策帮助；抖音不能只追单个热点，要同时看关联词、目标人群和内容供需缺口；视频号优先可信观点、关系传播和真实价值。",
    "17. “高级感、氛围感拉满、绝绝子、封神、谁懂、建议收藏、太出片、普通人也能、不是而是”等已被大量使用的套话默认降权，除非图片证据和本次实时信号都证明它仍是最佳表达。",
    "18. 可以借鉴当前流行的表达结构，但禁止复制公开内容原句。每组必须有原创措辞和明确的信息增量。",
    "19. score 必须真实反映上述六项评分，不要为了好看全部打高分；三组允许有明显分差。",
  ].join("\n");
}

function normalizeCopyResult_(result) {
  const sourceSets = result && Array.isArray(result.sets)
    ? result.sets.slice(0, 3)
    : [];

  const sets = sourceSets.map(function (item, index) {
    const source = item || {};
    return {
      eyebrow: cleanText_(source.eyebrow, 20) || ["咨询意向高", "收藏价值高", "互动共鸣高"][index],
      top: cleanCover_(source.top),
      bottom: cleanCover_(source.bottom),
      reason: cleanText_(source.reason, 100),
      score: Math.max(70, Math.min(99, Number(source.score || 90 - index * 2))),
      platforms: {
        xiaohongshu: normalizePlatform_(source.platforms && source.platforms.xiaohongshu, {
          titleMax: 20,
          bodyMax: 1000,
          topicMax: 8,
        }),
        douyin: normalizePlatform_(source.platforms && source.platforms.douyin, {
          titleMax: 30,
          bodyMax: 1000,
          topicMax: 5,
        }),
        channels: normalizePlatform_(source.platforms && source.platforms.channels, {
          titleMax: 30,
          bodyMax: 600,
          topicMax: 4,
        }),
      },
    };
  });

  return { sets: sets };
}

function finalizeCopyResult_(result, insight, trend, coverConfig) {
  const normalizedCoverConfig = normalizeCoverConfig_(coverConfig);
  const sourceSets = result && Array.isArray(result.sets)
    ? result.sets.slice(0, 3)
    : [];
  const sets = [];

  for (let index = 0; index < 3; index += 1) {
    const source = sourceSets[index] || {};
    const fallback = coverFallbackFor_(insight && insight.category, index);
    const item = {
      eyebrow: cleanText_(source.eyebrow, 20) || ["点击吸引力", "收藏参考值", "互动讨论度"][index],
      top: finalizeCoverLine_(
        source.top,
        normalizedCoverConfig,
        "top",
        fallback.top,
      ),
      bottom: finalizeCoverLine_(
        source.bottom,
        normalizedCoverConfig,
        "bottom",
        fallback.bottom,
      ),
      reason:
        cleanText_(source.reason, 100) ||
        cleanText_(insight && insight.contentOpportunity, 100) ||
        "围绕图片真实内容提炼传播重点。",
      score: Math.max(70, Math.min(99, Number(source.score || 92 - index * 3))),
      platforms: {},
    };

    item.platforms.xiaohongshu = finalizePlatform_(
      source.platforms && source.platforms.xiaohongshu,
      "xiaohongshu",
      item,
      insight,
      trend,
    );
    item.platforms.douyin = finalizePlatform_(
      source.platforms && source.platforms.douyin,
      "douyin",
      item,
      insight,
      trend,
    );
    item.platforms.channels = finalizePlatform_(
      source.platforms && source.platforms.channels,
      "channels",
      item,
      insight,
      trend,
    );
    sets.push(item);
  }

  sets.sort(function (left, right) {
    return Number(right.score || 0) - Number(left.score || 0);
  });
  return {
    sets: sets,
    autoCompleted: true,
    coverConfig: normalizedCoverConfig,
  };
}

function finalizePlatform_(value, platformKey, setItem, insight, trend) {
  const limits = {
    xiaohongshu: { titleMax: 20, bodyMax: 1000, topicMax: 8 },
    douyin: { titleMax: 30, bodyMax: 1000, topicMax: 5 },
    channels: { titleMax: 30, bodyMax: 600, topicMax: 4 },
  }[platformKey];
  const platform = normalizePlatform_(value, limits);
  const title = platform.title || cleanText_(setItem.top + setItem.bottom, limits.titleMax);
  const summary =
    cleanText_(insight && insight.summary, 180) ||
    "画面主体清晰，细节和氛围值得慢慢看。";
  const opportunity =
    cleanText_(insight && insight.contentOpportunity, 100) ||
    setItem.reason;
  const fallbackDescriptions = {
    xiaohongshu:
      "这张图最打动我的不是刻意制造的噱头，而是画面里真实可见的细节。" +
      summary +
      "。把注意力放回主体本身，反而更容易看见它的质感和表达。你最先注意到的是哪个细节？",
    douyin:
      "先别急着划走，这张图真正耐看的地方藏在细节里。" +
      summary +
      "。多看一秒，你会发现画面的重点完全不一样。你看到了吗？",
    channels:
      "一张值得停下来看的画面。" +
      summary +
      "。不依赖夸张表达，也能让真实内容被看见。",
  };
  const topicCandidates = []
    .concat(platform.topics || [])
    .concat((insight && insight.keywords) || [])
    .concat((trend && trend.terms) || []);
  const topics = normalizeTopics_(topicCandidates, limits.topicMax);
  while (topics.length < 2) {
    const fallbackTopic = topics.length ? "#真实分享" : "#图片内容";
    if (topics.indexOf(fallbackTopic) === -1) topics.push(fallbackTopic);
  }

  return {
    title: title,
    description:
      platform.description ||
      cleanText_(fallbackDescriptions[platformKey], limits.bodyMax),
    topics: topics,
    audience:
      platform.audience ||
      cleanText_(insight && insight.audience, 80) ||
      "关注画面审美与真实内容的人",
    hook:
      platform.hook ||
      cleanText_(setItem.eyebrow, 32) ||
      "细节悬念",
    strategy:
      platform.strategy ||
      cleanText_(opportunity, 120) ||
      "用图片真实细节建立停留和互动理由。",
  };
}

function coverFallbackFor_(category, index) {
  const normalized = String(category || "");
  let group = "other";
  if (/珠宝|首饰|手链|项链|戒指|宝石/.test(normalized)) group = "jewelry";
  else if (/男士|男性|男生/.test(normalized)) group = "men";
  else if (/女士|女性|女生/.test(normalized)) group = "women";
  else if (/美食|食物|餐饮|菜品/.test(normalized)) group = "food";
  else if (/服装|穿搭|衣服/.test(normalized)) group = "clothing";
  else if (/空间|室内|家居|建筑/.test(normalized)) group = "space";
  else if (/风景|自然|旅行/.test(normalized)) group = "landscape";
  else if (/活动|现场|聚会/.test(normalized)) group = "activity";
  else if (/产品|静物/.test(normalized)) group = "product";

  const groups = {
    jewelry: [
      { top: "暗光珠宝更出彩", bottom: "细节藏着高级质感" },
      { top: "这件珠宝太抓眼", bottom: "越看越有精致氛围" },
      { top: "镜头放大珠宝美", bottom: "每处细节都值得看" },
    ],
    men: [
      { top: "普通人也能出片", bottom: "真实状态更加耐看" },
      { top: "镜头里的松弛感", bottom: "不用硬凹也能出片" },
      { top: "男生拍照别端着", bottom: "自然一点反而更帅" },
    ],
    women: [
      { top: "镜头里的松弛感", bottom: "不费力也能很出片" },
      { top: "自然状态最耐看", bottom: "不用硬凹也有氛围" },
      { top: "这一刻太有感觉", bottom: "每个细节都很动人" },
    ],
    food: [
      { top: "这一口太有食欲", bottom: "隔着屏幕都闻到香" },
      { top: "刚端上桌就馋了", bottom: "每一口都值得期待" },
      { top: "这份美味藏不住", bottom: "看完真的忍不住馋" },
    ],
    clothing: [
      { top: "上身效果很惊喜", bottom: "简单搭配也有气质" },
      { top: "这套穿搭太显气", bottom: "日常照着搭就好看" },
      { top: "基础款也能出彩", bottom: "关键就在搭配细节" },
    ],
    space: [
      { top: "这个空间太舒服", bottom: "每个角落都有质感" },
      { top: "住进理想的空间", bottom: "光线一落就有氛围" },
      { top: "家里这样拍真美", bottom: "不用摆拍也很耐看" },
    ],
    landscape: [
      { top: "这一幕真的治愈", bottom: "随手一拍都是风景" },
      { top: "风景比想象更美", bottom: "站在这里舍不得走" },
      { top: "把这一刻留下来", bottom: "眼前风景值得收藏" },
    ],
    activity: [
      { top: "现场氛围太热烈", bottom: "隔着屏幕都被感染" },
      { top: "这一刻值得记录", bottom: "所有热爱都在现场" },
      { top: "镜头留住高光时", bottom: "每个瞬间都很精彩" },
    ],
    product: [
      { top: "这个细节太抓眼", bottom: "越看越有高级质感" },
      { top: "好产品经得起看", bottom: "放大细节更有说服" },
      { top: "质感藏在细节里", bottom: "不用夸张也能出彩" },
    ],
    other: [
      { top: "这一幕很有感觉", bottom: "越看越有故事氛围" },
      { top: "画面细节太抓眼", bottom: "多看一秒更有感觉" },
      { top: "这张图值得细看", bottom: "每个细节都有表达" },
    ],
  };
  return groups[group][Math.max(0, Math.min(2, Number(index || 0)))];
}

function forceCoverLength_(value, targetLength, fallback) {
  const cleaned = cleanCover_(value);
  if (codePointLength_(cleaned) >= targetLength) {
    return Array.from(cleaned).slice(0, targetLength).join("");
  }
  const emergency = cleanCover_(
    (cleaned || "") +
    (fallback || "") +
    "真实画面值得认真看见每个细节都有新的表达",
  );
  return Array.from(emergency).slice(0, targetLength).join("");
}

function finalizeCoverLine_(value, coverConfig, lineKey, fallback) {
  const normalizedCoverConfig = normalizeCoverConfig_(coverConfig);
  const targetLength = lineKey === "top"
    ? normalizedCoverConfig.topLength
    : normalizedCoverConfig.bottomLength;
  if (normalizedCoverConfig.mode === "manual") {
    return forceCoverLength_(value, targetLength, fallback);
  }

  const cleaned = cleanCover_(value);
  const length = codePointLength_(cleaned);
  if (length >= 4 && length <= 14) return cleaned;
  return cleanCover_(fallback);
}

function getCopyValidationIssues_(result, coverConfig) {
  const normalizedCoverConfig = normalizeCoverConfig_(coverConfig);
  const issues = [];
  if (!result || !Array.isArray(result.sets) || result.sets.length !== 3) {
    issues.push("方案数量不足");
    return issues;
  }
  result.sets.forEach(function (item, index) {
    if (!hasValidCoverLine_(item.top, normalizedCoverConfig, "top") ||
        !hasValidCoverLine_(item.bottom, normalizedCoverConfig, "bottom")) {
      issues.push("第" + (index + 1) + "组封面字数");
    }
    if (!hasCompletePlatformPackages_({ sets: [item] })) {
      issues.push("第" + (index + 1) + "组平台内容");
    }
  });
  return issues;
}

function logCopyRepair_(stage, details) {
  console.warn(
    JSON.stringify({
      stage: String(stage || "文案自动修复"),
      details: Array.isArray(details) ? details.slice(0, 12) : [],
    }),
  );
}

function normalizePlatform_(value, limits) {
  const item = value || {};
  return {
    title: cleanText_(item.title, limits.titleMax),
    description: cleanText_(item.description, limits.bodyMax),
    topics: normalizeTopics_(item.topics, limits.topicMax),
    audience: cleanText_(item.audience, 80),
    hook: cleanText_(item.hook, 32),
    strategy: cleanText_(item.strategy, 120),
  };
}

function normalizeTopics_(value, limit) {
  return normalizeTextArray_(value, limit, 24).map(function (tag) {
    const cleaned = String(tag || "").replace(/^#+/, "");
    return cleaned ? "#" + cleaned : "";
  }).filter(Boolean);
}

function hasValidCoverLine_(value, coverConfig, lineKey) {
  const normalizedCoverConfig = normalizeCoverConfig_(coverConfig);
  const length = codePointLength_(value);
  if (normalizedCoverConfig.mode === "manual") {
    const targetLength = lineKey === "top"
      ? normalizedCoverConfig.topLength
      : normalizedCoverConfig.bottomLength;
    return length === targetLength;
  }
  return length >= 4 && length <= 14;
}

function hasValidCoverLengths_(result, coverConfig) {
  return result.sets.every(function (item) {
    return hasValidCoverLine_(item.top, coverConfig, "top") &&
      hasValidCoverLine_(item.bottom, coverConfig, "bottom");
  });
}

function hasCompletePlatformPackages_(result) {
  return result.sets.every(function (item) {
    return ["xiaohongshu", "douyin", "channels"].every(function (key) {
      const platform = item.platforms && item.platforms[key];
      return Boolean(
        platform &&
        platform.title &&
        platform.description &&
        platform.topics &&
        platform.topics.length >= 2 &&
        platform.audience &&
        platform.hook &&
        platform.strategy
      );
    });
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
  required: ["category", "summary", "evidence", "keywords", "searchQueries", "audience", "contentOpportunity", "emotionalTone"],
  properties: {
    category: { type: "STRING" },
    summary: { type: "STRING" },
    evidence: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 5 },
    keywords: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 8 },
    searchQueries: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
    audience: { type: "STRING" },
    contentOpportunity: { type: "STRING" },
    emotionalTone: { type: "STRING" },
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
        required: ["eyebrow", "top", "bottom", "reason", "score", "platforms"],
        properties: {
          eyebrow: { type: "STRING" },
          top: { type: "STRING" },
          bottom: { type: "STRING" },
          reason: { type: "STRING" },
          score: { type: "INTEGER", minimum: 70, maximum: 99 },
          platforms: {
            type: "OBJECT",
            required: ["xiaohongshu", "douyin", "channels"],
            properties: {
              xiaohongshu: platformSchema_(5, 8),
              douyin: platformSchema_(3, 5),
              channels: platformSchema_(2, 4),
            },
          },
        },
      },
    },
  },
};

function platformSchema_(minTopics, maxTopics) {
  return {
    type: "OBJECT",
    required: ["title", "description", "topics", "audience", "hook", "strategy"],
    properties: {
      title: { type: "STRING" },
      description: { type: "STRING" },
      topics: {
        type: "ARRAY",
        items: { type: "STRING" },
        minItems: minTopics,
        maxItems: maxTopics,
      },
      audience: { type: "STRING" },
      hook: { type: "STRING" },
      strategy: { type: "STRING" },
    },
  };
}
