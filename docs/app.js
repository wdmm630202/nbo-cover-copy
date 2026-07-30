const PASSWORD_HASH = "d3cf6b77fdeae5ff43871acc766c91e3bca9b7d3b3a6c8c073d1ec0751df786d";
const ACCESS_KEY = "nbo_access_until";
const ACCESS_DAYS = 180;

const copyPools = [
  [
    {
      eyebrow: "转化意向最高",
      top: "男生这样拍真帅",
      bottom: "普通男生也能出片",
      reason: "直接回应“我不上镜”的顾虑，普通男生代入感强。",
      score: 96,
      body: {
        小红书: "很多男生不是不上镜，只是不知道镜头前该做什么。\n\n这组没有复杂摆拍，摄影师会从站姿、眼神到手部动作一步步带着拍。保留本人特点，也把状态拍得更干净、更自然。\n\n普通男生，也值得拥有一组真正像自己的照片。",
        抖音: "你不是不上镜，只是还没遇到会引导的摄影师。站姿、眼神、动作都不用提前练，跟着节奏拍，普通男生也能自然出片。",
        视频号: "拍照不是少数人的天赋。我们更在意真实、自然和适合本人，让每个普通男生都能留下状态很好的一面。",
      },
      tags: ["#男士写真", "#男生拍照", "#氛围感写真", "#普通人拍照", "#南铂摄影"],
    },
    {
      eyebrow: "降低决策门槛",
      top: "第一次拍照别慌",
      bottom: "跟着摄影师就能拍",
      reason: "消除第一次拍摄的紧张感，突出全程引导服务。",
      score: 93,
      body: {
        小红书: "第一次拍写真，紧张很正常。\n\n不用提前学动作，也不用担心表情僵。拍摄前先沟通你喜欢的感觉，现场摄影师全程引导，慢慢找到最适合你的状态。\n\n你只需要来，剩下的交给我们。",
        抖音: "第一次拍写真不知道手往哪放？别慌。现场有人带动作、调状态，不会摆拍也能轻松完成一组。",
        视频号: "好的拍摄体验，是让第一次面对镜头的人也能放松下来。提前沟通、现场引导、自然记录，过程和结果都拍得明白。",
      },
      tags: ["#第一次拍写真", "#摄影师引导", "#男生写真", "#写真体验", "#不会摆拍"],
    },
    {
      eyebrow: "强化画面价值",
      top: "氛围大片这样拍",
      bottom: "不用摆拍也很高级",
      reason: "用“自然高级”承接对质感有要求的人群。",
      score: 91,
      body: {
        小红书: "高级感不等于用力摆拍。\n\n找到合适的光线、干净的构图，再留一点自然的情绪，画面就会耐看很多。我们更想拍下你松弛、真实又有质感的样子。\n\n不过度修饰，照片依然有氛围。",
        抖音: "真正耐看的氛围感，不靠夸张动作。光线、构图和自然情绪到位，不用摆拍也很高级。",
        视频号: "越自然的状态，越经得起时间。用克制的光线和构图，把属于你的气质安静地留下来。",
      },
      tags: ["#氛围感大片", "#高级感写真", "#自然拍照", "#男士肖像", "#松弛感"],
    },
  ],
  [
    {
      eyebrow: "痛点表达最强",
      top: "镜头感不用天生",
      bottom: "这几个动作直接抄",
      reason: "用可学习的动作降低拍摄难度，适合收藏型内容。",
      score: 95,
      body: {
        小红书: "镜头感真的不是天生的。\n\n肩膀放松一点、身体微微侧开、视线别一直盯镜头，再给双手找一个自然的支点，画面马上就不一样。\n\n不会摆动作没关系，现场会有人一句一句告诉你。",
        抖音: "镜头感不用天生：身体侧一点，肩膀松一点，双手找支点。不会摆拍，照着这几个动作做就够了。",
        视频号: "自然上镜有方法，也需要耐心引导。我们从最简单的动作开始，让镜头前的状态一步步放松下来。",
      },
      tags: ["#拍照姿势", "#男生拍照动作", "#镜头感", "#拍照技巧", "#男士写真"],
    },
    {
      eyebrow: "套餐咨询意向高",
      top: "男生写真不踩雷",
      bottom: "三套风格一次拍够",
      reason: "明确风格丰富度，更容易带来套餐与价格咨询。",
      score: 92,
      body: {
        小红书: "想拍写真，又怕选错风格？\n\n干净肖像、氛围情绪、轻商务质感，一次拍到三种不同状态。拍前先看你的需求和日常风格，再决定服装与场景，不做千篇一律的模板。\n\n一组照片，看到不止一面的自己。",
        抖音: "男生写真怎么选风格？干净肖像、氛围情绪、轻商务质感，一次拍够三种状态，怎么发都不重复。",
        视频号: "一组好的男士写真，可以记录不同侧面的自己。我们会根据本人气质安排风格，让每套都有清晰区别。",
      },
      tags: ["#写真风格", "#男士形象照", "#轻商务写真", "#男生写真推荐", "#拍照攻略"],
    },
    {
      eyebrow: "情绪共鸣更强",
      top: "今天做次男主角",
      bottom: "把少年感留在照片",
      reason: "情绪价值明确，适合生日、纪念日等消费场景。",
      score: 90,
      body: {
        小红书: "生活里总在赶路，也该有一天认真记录自己。\n\n不是为了变成谁，只是把当下的状态、眼神和那一点少年感留下来。很多年后再看，照片会替你记得今天。\n\n这一次，你就是自己的男主角。",
        抖音: "总要有一天，把镜头留给自己。不是为了变成谁，只是把今天的少年感认真保存下来。",
        视频号: "照片的意义，是多年以后依然能想起当时的自己。今天不做配角，认真留下一次属于自己的记录。",
      },
      tags: ["#记录自己", "#少年感写真", "#生日写真", "#男主角氛围", "#值得纪念"],
    },
  ],
  [
    {
      eyebrow: "真实感最突出",
      top: "素人也能拍出彩",
      bottom: "见面才发现有多帅",
      reason: "突出素人改造前后反差，天然适合案例展示。",
      score: 95,
      body: {
        小红书: "每次客人都说：我平时真的不会拍照。\n\n但见面后从发型、服装到光线慢慢调整，再找到适合他的角度，原本藏着的状态就出来了。不是把人修成另一个样子，而是把本人好看的一面拍清楚。\n\n素人也可以很出彩。",
        抖音: "客人说自己不会拍照，见面后才发现明明很有感觉。找对光线和角度，素人也能拍出自己的高光时刻。",
        视频号: "我们不把客人套进模板，而是从本人特点出发。真实、自然、看得见变化，才是一组照片最有价值的地方。",
      },
      tags: ["#素人改造", "#客片分享", "#男生变帅", "#真实客片", "#写真前后对比"],
    },
    {
      eyebrow: "信任意向最高",
      top: "拍照不只为好看",
      bottom: "也是记录当下自己",
      reason: "从消费升级到纪念价值，适合品牌长期内容。",
      score: 92,
      body: {
        小红书: "拍照当然想要好看，但又不只是好看。\n\n它记录的是这一年的你：正在经历什么、是什么状态、眼神里有什么。我们会把画面处理得更干净，也会尽量保留属于你的真实感。\n\n以后再看，你会认得当时的自己。",
        抖音: "拍照不只是为了发朋友圈，也是替未来的自己，认真保存一次现在的样子。",
        视频号: "影像最珍贵的地方，是它能替时间留下证据。拍下当下真实的自己，也拍下这一阶段独有的状态。",
      },
      tags: ["#记录当下", "#写真意义", "#男士影像", "#时间的照片", "#个人写真"],
    },
    {
      eyebrow: "品质感更明确",
      top: "高级不是修得狠",
      bottom: "保留本人更加耐看",
      reason: "回应过度修图顾虑，突出自然、耐看的交付标准。",
      score: 89,
      body: {
        小红书: "我们理解的高级，不是把皮肤磨得没有质感，也不是把五官修成另一个人。\n\n该调整的细节认真调整，该保留的个人特点也会保留。照片干净、有状态，几年后再看依然像你。\n\n自然耐看，比过度精致更重要。",
        抖音: "高级感不是修得狠。保留皮肤质感和本人特点，干净、自然、像自己，照片才会越看越耐看。",
        视频号: "修图的边界，是让照片更好，而不是让人失去自己的特点。克制处理，才能让影像经得起时间。",
      },
      tags: ["#自然修图", "#高级感照片", "#真实质感", "#男士摄影", "#审美在线"],
    },
  ],
];

let poolIndex = 0;
let selectedIndex = 0;
let platform = "小红书";
let toastTimer;
let preparedImage = null;
let analysisState = "empty";
let analysisProgressValue = 0;
let analysisTimer;
let progressTimer;
let analysisRunId = 0;

const accessGate = document.querySelector("#accessGate");
const app = document.querySelector("#app");
const accessForm = document.querySelector("#accessForm");
const accessPassword = document.querySelector("#accessPassword");
const gateError = document.querySelector("#gateError");
const fileInput = document.querySelector("#fileInput");
const uploadCard = document.querySelector("#uploadCard");
const uploadEmpty = document.querySelector("#uploadEmpty");
const imagePreview = document.querySelector("#imagePreview");
const previewImage = document.querySelector("#previewImage");
const previewSize = document.querySelector("#previewSize");
const previewName = document.querySelector("#previewName");
const replaceImage = document.querySelector("#replaceImage");
const analysisButton = document.querySelector("#analysisButton");
const analysisButtonIcon = document.querySelector("#analysisButtonIcon");
const analysisButtonLabel = document.querySelector("#analysisButtonLabel");
const analysisProgress = document.querySelector("#analysisProgress");
const analysisProgressText = document.querySelector("#analysisProgressText");
const analysisProgressFill = document.querySelector("#analysisProgressFill");
const scanLine = document.querySelector("#scanLine");
const insightStatus = document.querySelector("#insightStatus");
const insightTitle = document.querySelector("#insightTitle");
const insightDescription = document.querySelector("#insightDescription");
const insightTags = document.querySelector("#insightTags");
const brandNote = document.querySelector("#brandNote");
const brandHint = document.querySelector("#brandHint");
const copyGrid = document.querySelector("#copyGrid");
const refreshButton = document.querySelector("#refreshButton");
const bodyText = document.querySelector("#bodyText");
const bodyCount = document.querySelector("#bodyCount");
const platformNote = document.querySelector("#platformNote");
const topicList = document.querySelector("#topicList");
const exportDescription = document.querySelector("#exportDescription");
const copyToast = document.querySelector("#copyToast");

function isAccessRemembered() {
  try {
    return Number(localStorage.getItem(ACCESS_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

function showApplication() {
  accessGate.classList.add("is-hidden");
  app.classList.remove("is-hidden");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submittedHash = await sha256(accessPassword.value.trim());
  if (submittedHash !== PASSWORD_HASH) {
    gateError.classList.remove("is-hidden");
    accessPassword.select();
    return;
  }

  try {
    localStorage.setItem(ACCESS_KEY, String(Date.now() + ACCESS_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // The app remains usable even when storage is disabled.
  }
  gateError.classList.add("is-hidden");
  showApplication();
});

function characterCount(value) {
  return Array.from(value).length;
}

function currentSets() {
  return copyPools[poolIndex];
}

function activeSet() {
  return currentSets()[selectedIndex];
}

function renderInsightTags(tags = ["男士人像", "自然状态", "干净构图", "质感表达"]) {
  insightTags.replaceChildren();
  tags.forEach((tag) => {
    const item = document.createElement("span");
    item.textContent = tag;
    insightTags.appendChild(item);
  });
}

function renderCards() {
  copyGrid.replaceChildren();
  currentSets().forEach((item, index) => {
    const article = document.createElement("article");
    article.className = `copy-card${selectedIndex === index ? " selected" : ""}`;
    article.dataset.index = String(index);

    const topCount = characterCount(item.top);
    const bottomCount = characterCount(item.bottom);
    article.innerHTML = `
      <div class="card-topline">
        <span class="rank">0${index + 1}</span>
        <span class="intent">${item.eyebrow}</span>
        <span class="score">${item.score}<small>分</small></span>
      </div>
      <div class="cover-copy">
        <div>
          <strong>${item.top}</strong>
          <span class="${topCount === 7 ? "valid" : "invalid"}">${topCount}/7</span>
        </div>
        <div>
          <strong>${item.bottom}</strong>
          <span class="${bottomCount === 8 ? "valid" : "invalid"}">${bottomCount}/8</span>
        </div>
      </div>
      <p>${item.reason}</p>
      <div class="card-actions">
        <button type="button" data-copy-title="${index}">复制封面文案</button>
        <button class="select-card" type="button" aria-label="选择方案${index + 1}">${selectedIndex === index ? "✓" : "→"}</button>
      </div>
    `;
    copyGrid.appendChild(article);
  });
  renderPublishing();
}

function renderPublishing() {
  const active = activeSet();
  const body = active.body[platform];
  bodyText.value = body;
  bodyCount.textContent = `${characterCount(body)} 字`;
  platformNote.textContent = `已按${platform}阅读习惯整理`;
  exportDescription.textContent = `封面标题 + ${platform}正文 + 5个相关话题`;

  topicList.replaceChildren();
  active.tags.forEach((tag, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tag = tag;
    button.innerHTML = `<span>${index < 2 ? "热" : index === 4 ? "品" : "准"}</span><b></b><i>＋</i>`;
    button.querySelector("b").textContent = tag;
    topicList.appendChild(button);
  });
}

function setPlatform(nextPlatform) {
  platform = nextPlatform;
  document.querySelectorAll("[data-platform]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.platform === platform));
  });
  renderPublishing();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  copyToast.textContent = message;
  copyToast.classList.remove("is-hidden");
  toastTimer = window.setTimeout(() => copyToast.classList.add("is-hidden"), 1600);
}

async function copyText(value, message = "已复制") {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  showToast(message);
}

function clearAnalysisTimers() {
  window.clearTimeout(analysisTimer);
  window.clearInterval(progressTimer);
  analysisTimer = undefined;
  progressTimer = undefined;
}

function setProgress(value) {
  analysisProgressValue = value;
  analysisProgressText.textContent = `${value}%`;
  analysisProgressFill.style.width = `${value}%`;
  if (analysisState === "running") insightStatus.textContent = `识别进行中 ${value}%`;
}

function setAnalysisState(nextState) {
  analysisState = nextState;
  const running = nextState === "running";

  imagePreview.classList.toggle("analyzing", running);
  scanLine.classList.toggle("is-hidden", !running);
  analysisProgress.classList.toggle("is-hidden", !running);
  insightStatus.classList.toggle("running", running);
  replaceImage.disabled = running;
  analysisButton.disabled = !preparedImage;
  analysisButton.classList.toggle("stop", running);
  analysisButtonIcon.textContent = running ? "■" : "▶";

  if (nextState === "done") {
    analysisButtonLabel.textContent = "重新识别";
    insightStatus.textContent = "已完成基础识别";
    return;
  }
  if (running) {
    analysisButtonLabel.textContent = "停止识别";
    insightStatus.textContent = `识别进行中 ${analysisProgressValue}%`;
    insightTitle.textContent = "正在识别画面信息…";
    insightDescription.textContent = "任务正在运行，你可以随时点击“停止识别”中断本次处理。";
    renderInsightTags(["读取构图", "分析光线", "判断色调", "匹配内容"]);
    return;
  }
  if (nextState === "stopped") {
    analysisButtonLabel.textContent = "重新开始";
    insightStatus.textContent = "已停止，可重新开始";
    insightTitle.textContent = "识别已停止";
    insightDescription.textContent = "本次任务没有生成结果。确认照片无误后可重新开始，也可以重新上传。";
    renderInsightTags();
    return;
  }
  if (nextState === "ready") {
    analysisButtonLabel.textContent = "开始识别";
    insightStatus.textContent = "图片已就绪";
    insightTitle.textContent = "图片已准备好，点击“开始识别”";
    insightDescription.textContent = "上传只做预览，不会自动执行。确认照片无误后再开始。";
    renderInsightTags();
    return;
  }

  analysisButtonLabel.textContent = "开始识别";
  insightStatus.textContent = "上传后手动开始";
  insightTitle.textContent = "等待你的图片";
  insightDescription.textContent = "上传后将等待你确认，再读取尺寸、构图、色调与光线。下方已放入男士写真示例供你预览。";
}

function prepareImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("请选择图片文件");
    return;
  }

  clearAnalysisTimers();
  analysisRunId += 1;
  preparedImage = null;
  setProgress(0);
  setAnalysisState("empty");

  const reader = new FileReader();
  reader.onload = () => {
    const source = String(reader.result);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 80;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      let brightness = 150;
      let warmth = 0;

      if (context) {
        context.drawImage(image, 0, 0, 80, 80);
        const pixels = context.getImageData(0, 0, 80, 80).data;
        let lightTotal = 0;
        let warmTotal = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          lightTotal += pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
          warmTotal += pixels[index] - pixels[index + 2];
        }
        brightness = lightTotal / (pixels.length / 4);
        warmth = warmTotal / (pixels.length / 4);
      }

      const size = file.size > 1024 * 1024
        ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

      preparedImage = {
        name: file.name,
        source,
        width: image.width,
        height: image.height,
        brightness,
        warmth,
        size,
      };
      previewImage.src = source;
      previewSize.textContent = `${image.width} × ${image.height}`;
      previewName.textContent = file.name;
      uploadEmpty.classList.add("is-hidden");
      imagePreview.classList.remove("is-hidden");
      setAnalysisState("ready");
    };
    image.src = source;
  };
  reader.readAsDataURL(file);
}

function startAnalysis() {
  if (!preparedImage || analysisState === "running") return;
  clearAnalysisTimers();
  const runId = analysisRunId + 1;
  analysisRunId = runId;
  setProgress(8);
  setAnalysisState("running");

  progressTimer = window.setInterval(() => {
    setProgress(Math.min(92, analysisProgressValue + Math.max(2, Math.round((94 - analysisProgressValue) / 7))));
  }, 170);

  analysisTimer = window.setTimeout(() => {
    if (analysisRunId !== runId || !preparedImage) return;
    clearAnalysisTimers();

    const ratioNumber = preparedImage.width / preparedImage.height;
    const orientation = ratioNumber > 1.12 ? "横版构图" : ratioNumber < 0.88 ? "竖版人像" : "方形构图";
    const ratio = ratioNumber > 1.12 ? "适合视频号" : ratioNumber < 0.88 ? "适合封面" : "社媒友好";
    const tone = preparedImage.warmth > 12 ? "暖调氛围" : preparedImage.warmth < -8 ? "冷调质感" : "自然色调";
    const light = preparedImage.brightness > 178 ? "明亮干净" : preparedImage.brightness < 95 ? "低调情绪" : "光线柔和";

    insightTitle.textContent = "已读懂这张图片的基础视觉信息";
    insightDescription.textContent = `${preparedImage.width} × ${preparedImage.height} · ${preparedImage.size}。免费版已根据构图、明暗与色调匹配内容方向。`;
    renderInsightTags([orientation, tone, light, ratio]);
    poolIndex = Math.abs(preparedImage.name.length + preparedImage.width + preparedImage.height) % copyPools.length;
    selectedIndex = 0;
    renderCards();
    setProgress(100);
    setAnalysisState("done");
  }, 2200);
}

function stopAnalysis() {
  if (analysisState !== "running") return;
  analysisRunId += 1;
  clearAnalysisTimers();
  setProgress(0);
  setAnalysisState("stopped");
}

function openFilePicker() {
  fileInput.value = "";
  fileInput.click();
}

uploadEmpty.addEventListener("click", openFilePicker);
replaceImage.addEventListener("click", openFilePicker);
analysisButton.addEventListener("click", () => {
  if (analysisState === "running") stopAnalysis();
  else startAnalysis();
});
fileInput.addEventListener("change", () => prepareImage(fileInput.files?.[0]));

["dragenter", "dragover"].forEach((eventName) => {
  uploadCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadCard.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadCard.classList.remove("dragging");
  });
});

uploadCard.addEventListener("drop", (event) => prepareImage(event.dataTransfer?.files?.[0]));

copyGrid.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy-title]");
  if (copyButton) {
    const item = currentSets()[Number(copyButton.dataset.copyTitle)];
    copyText(`${item.top}\n${item.bottom}`, "封面文案已复制");
    return;
  }

  const card = event.target.closest(".copy-card");
  if (!card) return;
  selectedIndex = Number(card.dataset.index);
  renderCards();
});

refreshButton.addEventListener("click", () => {
  copyGrid.classList.add("loading");
  refreshButton.querySelector("span").classList.add("spin");
  window.setTimeout(() => {
    poolIndex = (poolIndex + 1) % copyPools.length;
    selectedIndex = 0;
    renderCards();
    copyGrid.classList.remove("loading");
    refreshButton.querySelector("span").classList.remove("spin");
  }, 360);
});

document.querySelectorAll("[data-platform]").forEach((button) => {
  button.addEventListener("click", () => setPlatform(button.dataset.platform));
});

document.querySelector("#copyBody").addEventListener("click", () => copyText(activeSet().body[platform], "正文已复制"));
document.querySelector("#copyTags").addEventListener("click", () => copyText(activeSet().tags.join(" "), "话题已复制"));
topicList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  if (button) copyText(button.dataset.tag, "话题已复制");
});
document.querySelector("#copyAll").addEventListener("click", () => {
  const active = activeSet();
  copyText(
    `${active.top}\n${active.bottom}\n\n${active.body[platform]}\n\n${active.tags.join(" ")}`,
    "整套内容已复制",
  );
});

brandNote.addEventListener("input", () => {
  const value = brandNote.value.trim() || "你的账号定位";
  brandHint.textContent = `文案将围绕“${value}”生成`;
  try {
    localStorage.setItem("nbo_brand_note", brandNote.value);
  } catch {
    // Keep the current value in memory when browser storage is disabled.
  }
});

try {
  const savedBrandNote = localStorage.getItem("nbo_brand_note");
  if (savedBrandNote) brandNote.value = savedBrandNote;
} catch {
  // Browser storage can be disabled without blocking the tool.
}

brandNote.dispatchEvent(new Event("input"));
renderInsightTags();
renderCards();

if (isAccessRemembered()) {
  showApplication();
} else {
  accessPassword.focus();
}
