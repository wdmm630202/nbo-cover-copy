"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

type Platform = "小红书" | "抖音" | "视频号";

type CopySet = {
  eyebrow: string;
  top: string;
  bottom: string;
  reason: string;
  score: number;
  body: Record<Platform, string>;
  tags: string[];
};

type ImageInfo = {
  name: string;
  width: number;
  height: number;
  orientation: string;
  tone: string;
  light: string;
  ratio: string;
  size: string;
};

type PreparedImage = {
  name: string;
  source: string;
  width: number;
  height: number;
  brightness: number;
  warmth: number;
  size: string;
};

type AnalysisState = "empty" | "ready" | "running" | "stopped" | "done";

const copyPools: CopySet[][] = [
  [
    {
      eyebrow: "转化意向最高",
      top: "男生这样拍真帅",
      bottom: "普通男生也能出片",
      reason: "直接回应“我不上镜”的顾虑，普通男生代入感强。",
      score: 96,
      body: {
        小红书:
          "很多男生不是不上镜，只是不知道镜头前该做什么。\n\n这组没有复杂摆拍，摄影师会从站姿、眼神到手部动作一步步带着拍。保留本人特点，也把状态拍得更干净、更自然。\n\n普通男生，也值得拥有一组真正像自己的照片。",
        抖音:
          "你不是不上镜，只是还没遇到会引导的摄影师。站姿、眼神、动作都不用提前练，跟着节奏拍，普通男生也能自然出片。",
        视频号:
          "拍照不是少数人的天赋。我们更在意真实、自然和适合本人，让每个普通男生都能留下状态很好的一面。",
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
        小红书:
          "第一次拍写真，紧张很正常。\n\n不用提前学动作，也不用担心表情僵。拍摄前先沟通你喜欢的感觉，现场摄影师全程引导，慢慢找到最适合你的状态。\n\n你只需要来，剩下的交给我们。",
        抖音:
          "第一次拍写真不知道手往哪放？别慌。现场有人带动作、调状态，不会摆拍也能轻松完成一组。",
        视频号:
          "好的拍摄体验，是让第一次面对镜头的人也能放松下来。提前沟通、现场引导、自然记录，过程和结果都拍得明白。",
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
        小红书:
          "高级感不等于用力摆拍。\n\n找到合适的光线、干净的构图，再留一点自然的情绪，画面就会耐看很多。我们更想拍下你松弛、真实又有质感的样子。\n\n不过度修饰，照片依然有氛围。",
        抖音:
          "真正耐看的氛围感，不靠夸张动作。光线、构图和自然情绪到位，不用摆拍也很高级。",
        视频号:
          "越自然的状态，越经得起时间。用克制的光线和构图，把属于你的气质安静地留下来。",
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
        小红书:
          "镜头感真的不是天生的。\n\n肩膀放松一点、身体微微侧开、视线别一直盯镜头，再给双手找一个自然的支点，画面马上就不一样。\n\n不会摆动作没关系，现场会有人一句一句告诉你。",
        抖音:
          "镜头感不用天生：身体侧一点，肩膀松一点，双手找支点。不会摆拍，照着这几个动作做就够了。",
        视频号:
          "自然上镜有方法，也需要耐心引导。我们从最简单的动作开始，让镜头前的状态一步步放松下来。",
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
        小红书:
          "想拍写真，又怕选错风格？\n\n干净肖像、氛围情绪、轻商务质感，一次拍到三种不同状态。拍前先看你的需求和日常风格，再决定服装与场景，不做千篇一律的模板。\n\n一组照片，看到不止一面的自己。",
        抖音:
          "男生写真怎么选风格？干净肖像、氛围情绪、轻商务质感，一次拍够三种状态，怎么发都不重复。",
        视频号:
          "一组好的男士写真，可以记录不同侧面的自己。我们会根据本人气质安排风格，让每套都有清晰区别。",
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
        小红书:
          "生活里总在赶路，也该有一天认真记录自己。\n\n不是为了变成谁，只是把当下的状态、眼神和那一点少年感留下来。很多年后再看，照片会替你记得今天。\n\n这一次，你就是自己的男主角。",
        抖音:
          "总要有一天，把镜头留给自己。不是为了变成谁，只是把今天的少年感认真保存下来。",
        视频号:
          "照片的意义，是多年以后依然能想起当时的自己。今天不做配角，认真留下一次属于自己的记录。",
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
        小红书:
          "每次客人都说：我平时真的不会拍照。\n\n但见面后从发型、服装到光线慢慢调整，再找到适合他的角度，原本藏着的状态就出来了。不是把人修成另一个样子，而是把本人好看的一面拍清楚。\n\n素人也可以很出彩。",
        抖音:
          "客人说自己不会拍照，见面后才发现明明很有感觉。找对光线和角度，素人也能拍出自己的高光时刻。",
        视频号:
          "我们不把客人套进模板，而是从本人特点出发。真实、自然、看得见变化，才是一组照片最有价值的地方。",
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
        小红书:
          "拍照当然想要好看，但又不只是好看。\n\n它记录的是这一年的你：正在经历什么、是什么状态、眼神里有什么。我们会把画面处理得更干净，也会尽量保留属于你的真实感。\n\n以后再看，你会认得当时的自己。",
        抖音:
          "拍照不只是为了发朋友圈，也是替未来的自己，认真保存一次现在的样子。",
        视频号:
          "影像最珍贵的地方，是它能替时间留下证据。拍下当下真实的自己，也拍下这一阶段独有的状态。",
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
        小红书:
          "我们理解的高级，不是把皮肤磨得没有质感，也不是把五官修成另一个人。\n\n该调整的细节认真调整，该保留的个人特点也会保留。照片干净、有状态，几年后再看依然像你。\n\n自然耐看，比过度精致更重要。",
        抖音:
          "高级感不是修得狠。保留皮肤质感和本人特点，干净、自然、像自己，照片才会越看越耐看。",
        视频号:
          "修图的边界，是让照片更好，而不是让人失去自己的特点。克制处理，才能让影像经得起时间。",
      },
      tags: ["#自然修图", "#高级感照片", "#真实质感", "#男士摄影", "#审美在线"],
    },
  ],
];

const countChars = (text: string) => Array.from(text).length;

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const analysisRunRef = useRef(0);
  const [preview, setPreview] = useState<string>("");
  const [preparedImage, setPreparedImage] = useState<PreparedImage | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("empty");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [platform, setPlatform] = useState<Platform>("小红书");
  const [poolIndex, setPoolIndex] = useState(0);
  const [selected, setSelected] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copied, setCopied] = useState("");
  const [brandNote, setBrandNote] = useState("男士写真｜自然引导｜真实耐看");

  const currentSets = copyPools[poolIndex];
  const active = currentSets[selected];

  const insightTags = useMemo(() => {
    if (!imageInfo) {
      if (analysisState === "running") return ["读取构图", "分析光线", "判断色调", "匹配内容"];
      return ["男士人像", "自然状态", "干净构图", "质感表达"];
    }
    return [
      imageInfo.orientation,
      imageInfo.tone,
      imageInfo.light,
      imageInfo.ratio,
    ];
  }, [analysisState, imageInfo]);

  const clearAnalysisTimers = () => {
    if (analysisTimerRef.current !== null) {
      window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  useEffect(() => () => clearAnalysisTimers(), []);

  const showCopied = (key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    showCopied(key);
  };

  const prepareImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    clearAnalysisTimers();
    analysisRunRef.current += 1;
    setImageInfo(null);
    setPreparedImage(null);
    setAnalysisProgress(0);
    setAnalysisState("empty");
    setIsAnalyzing(false);
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      setPreview(src);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const sampleSize = 80;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        let brightness = 150;
        let warmth = 0;
        if (context) {
          context.drawImage(img, 0, 0, sampleSize, sampleSize);
          const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
          let total = 0;
          let warmTotal = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            total += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
            warmTotal += pixels[i] - pixels[i + 2];
          }
          brightness = total / (pixels.length / 4);
          warmth = warmTotal / (pixels.length / 4);
        }

        setPreparedImage({
          name: file.name,
          source: src,
          width: img.width,
          height: img.height,
          brightness,
          warmth,
          size: file.size > 1024 * 1024
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
            : `${Math.max(1, Math.round(file.size / 1024))} KB`,
        });
        setAnalysisState("ready");
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const startAnalysis = () => {
    if (!preparedImage || analysisState === "running") return;
    clearAnalysisTimers();
    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    setImageInfo(null);
    setAnalysisProgress(8);
    setAnalysisState("running");
    setIsAnalyzing(true);

    progressTimerRef.current = window.setInterval(() => {
      setAnalysisProgress((value) => Math.min(92, value + Math.max(2, Math.round((94 - value) / 7))));
    }, 170);

    analysisTimerRef.current = window.setTimeout(() => {
      if (analysisRunRef.current !== runId) return;
      clearAnalysisTimers();
      const ratioNumber = preparedImage.width / preparedImage.height;
      const orientation =
        ratioNumber > 1.12 ? "横版构图" : ratioNumber < 0.88 ? "竖版人像" : "方形构图";
      const ratio =
        ratioNumber > 1.12 ? "适合视频号" : ratioNumber < 0.88 ? "适合封面" : "社媒友好";
      const tone =
        preparedImage.warmth > 12 ? "暖调氛围" : preparedImage.warmth < -8 ? "冷调质感" : "自然色调";
      const light =
        preparedImage.brightness > 178 ? "明亮干净" : preparedImage.brightness < 95 ? "低调情绪" : "光线柔和";

      setImageInfo({
        name: preparedImage.name,
        width: preparedImage.width,
        height: preparedImage.height,
        orientation,
        tone,
        light,
        ratio,
        size: preparedImage.size,
      });
      setPoolIndex(Math.abs(preparedImage.name.length + preparedImage.width + preparedImage.height) % copyPools.length);
      setSelected(0);
      setAnalysisProgress(100);
      setAnalysisState("done");
      setIsAnalyzing(false);
    }, 2200);
  };

  const stopAnalysis = () => {
    if (analysisState !== "running") return;
    analysisRunRef.current += 1;
    clearAnalysisTimers();
    setAnalysisProgress(0);
    setAnalysisState("stopped");
    setIsAnalyzing(false);
    setImageInfo(null);
  };

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) prepareImage(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) prepareImage(file);
  };

  const refresh = () => {
    setIsAnalyzing(true);
    setPoolIndex((value) => (value + 1) % copyPools.length);
    setSelected(0);
    window.setTimeout(() => setIsAnalyzing(false), 520);
  };

  const exportAll = () => {
    const title = `${active.top}\n${active.bottom}`;
    const text = `${title}\n\n${active.body[platform]}\n\n${active.tags.join(" ")}`;
    copyText(text, "all");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="NBO 灵感封面首页">
          <span className="brand-mark">N</span>
          <span>
            <strong>NBO 灵感封面</strong>
            <small>图片一传，文案即来</small>
          </span>
        </a>
        <nav className="top-actions" aria-label="页面导航">
          <a href="#works">作品库</a>
          <button className="avatar-button" aria-label="账户设置">南</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="kicker"><i /> AI 内容灵感工作台</span>
          <h1>一张图片，整理好<br /><em>整套发布文案</em></h1>
          <p>识别画面信息，生成固定15字封面标题、发布软文和相关话题。一次给你3组高意向方案。</p>
          <div className="feature-row" aria-label="核心能力">
            <span>上行 7 字</span>
            <b>·</b>
            <span>下行 8 字</span>
            <b>·</b>
            <span>三平台适配</span>
          </div>
        </div>

        <div
          className={`upload-card ${isDragging ? "dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            aria-label="上传需要识别的图片"
          />
          {preview ? (
            <div className="image-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="已上传图片预览" />
              <div className="preview-shade" />
              {analysisState === "running" && <div className="scan-line" aria-hidden="true" />}
              <div className="preview-actions">
                <button className="replace-image" onClick={openFilePicker} disabled={analysisState === "running"}>
                  重新上传
                </button>
                <button
                  className={`analysis-button ${analysisState === "running" ? "stop" : ""}`}
                  onClick={analysisState === "running" ? stopAnalysis : startAnalysis}
                  disabled={!preparedImage}
                >
                  <span>{analysisState === "running" ? "■" : "▶"}</span>
                  {analysisState === "running"
                    ? "停止识别"
                    : analysisState === "done"
                      ? "重新识别"
                      : analysisState === "stopped"
                        ? "重新开始"
                        : "开始识别"}
                </button>
              </div>
              {analysisState === "running" && (
                <div className="analysis-progress" role="status" aria-live="polite">
                  <div>
                    <span className="running-dot" />
                    <strong>任务正在运行</strong>
                    <em>{analysisProgress}%</em>
                  </div>
                  <i><b style={{ width: `${analysisProgress}%` }} /></i>
                </div>
              )}
              <div className="preview-caption">
                <span>{preparedImage?.width} × {preparedImage?.height}</span>
                <strong>{preparedImage?.name}</strong>
              </div>
            </div>
          ) : (
            <button className="upload-empty" onClick={openFilePicker}>
              <span className="upload-icon"><i>＋</i></span>
              <strong>上传一张图片开始</strong>
              <small>点击选择或拖拽图片到这里</small>
              <em>支持 JPG、PNG、WEBP · 最大 20MB</em>
            </button>
          )}
          <div className="privacy-note"><span>✓</span> 图片仅用于本次本地分析，不会公开</div>
        </div>
      </section>

      <section className="workspace" id="works">
        <div className="section-heading">
          <div>
            <span className="step-label">01 / 图片理解</span>
            <h2>画面信息</h2>
          </div>
          <span className={`status-pill ${analysisState === "running" ? "running" : ""}`}>
            {analysisState === "done"
              ? "已完成基础识别"
              : analysisState === "running"
                ? `识别进行中 ${analysisProgress}%`
                : analysisState === "stopped"
                  ? "已停止，可重新开始"
                  : analysisState === "ready"
                    ? "图片已就绪"
                    : "上传后手动开始"}
          </span>
        </div>

        <div className="insight-panel">
          <div className="insight-main">
            <div className="insight-orb">✦</div>
            <div>
              <strong>
                {imageInfo
                  ? "已读懂这张图片的基础视觉信息"
                  : analysisState === "running"
                    ? "正在识别画面信息…"
                    : analysisState === "stopped"
                      ? "识别已停止"
                      : analysisState === "ready"
                        ? "图片已准备好，点击“开始识别”"
                        : "等待你的图片"}
              </strong>
              <p>
                {imageInfo
                  ? `${imageInfo.width} × ${imageInfo.height} · ${imageInfo.size}。初版已根据构图、明暗与色调匹配内容方向。`
                  : analysisState === "running"
                    ? "任务正在运行，你可以随时点击“停止识别”中断本次处理。"
                    : analysisState === "stopped"
                      ? "本次任务没有生成结果。确认照片无误后可重新开始，也可以重新上传。"
                      : analysisState === "ready"
                        ? "上传只做预览，不会自动执行。确认照片无误后再开始。"
                        : "上传后将等待你确认，再读取尺寸、构图、色调与光线。下方已放入男士写真示例供你预览。"}
              </p>
            </div>
          </div>
          <div className="insight-tags">
            {insightTags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>

        <div className="setting-strip">
          <label>
            <span>账号定位</span>
            <input value={brandNote} onChange={(event) => setBrandNote(event.target.value)} maxLength={28} />
          </label>
          <div className="setting-hint">文案将围绕“{brandNote || "你的账号定位"}”生成</div>
        </div>

        <div className="section-heading result-heading">
          <div>
            <span className="step-label">02 / 高意向方案</span>
            <h2>为你优选 3 组</h2>
          </div>
          <button className="refresh-button" onClick={refresh} disabled={isAnalyzing}>
            <span className={isAnalyzing ? "spin" : ""}>↻</span> 不满意，换一批
          </button>
        </div>

        <div className={`copy-grid ${isAnalyzing ? "loading" : ""}`}>
          {currentSets.map((item, index) => (
            <article
              className={`copy-card ${selected === index ? "selected" : ""}`}
              key={`${poolIndex}-${item.top}`}
              onClick={() => setSelected(index)}
            >
              <div className="card-topline">
                <span className="rank">0{index + 1}</span>
                <span className="intent">{item.eyebrow}</span>
                <span className="score">{item.score}<small>分</small></span>
              </div>
              <div className="cover-copy">
                <div>
                  <strong>{item.top}</strong>
                  <span className={countChars(item.top) === 7 ? "valid" : "invalid"}>
                    {countChars(item.top)}/7
                  </span>
                </div>
                <div>
                  <strong>{item.bottom}</strong>
                  <span className={countChars(item.bottom) === 8 ? "valid" : "invalid"}>
                    {countChars(item.bottom)}/8
                  </span>
                </div>
              </div>
              <p>{item.reason}</p>
              <div className="card-actions">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    copyText(`${item.top}\n${item.bottom}`, `title-${index}`);
                  }}
                >
                  {copied === `title-${index}` ? "已复制" : "复制封面文案"}
                </button>
                <button className="select-card" aria-label={`选择方案${index + 1}`}>
                  {selected === index ? "✓" : "→"}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="section-heading publish-heading">
          <div>
            <span className="step-label">03 / 发布整理</span>
            <h2>正文与话题</h2>
          </div>
          <div className="platform-tabs" role="tablist" aria-label="发布平台">
            {(["小红书", "抖音", "视频号"] as Platform[]).map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={platform === item}
                onClick={() => setPlatform(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="publish-grid">
          <article className="publish-card body-card">
            <div className="publish-card-title">
              <div>
                <span>发布软文</span>
                <small>已按{platform}阅读习惯整理</small>
              </div>
              <button onClick={() => copyText(active.body[platform], "body")}>
                {copied === "body" ? "已复制" : "复制正文"}
              </button>
            </div>
            <textarea
              aria-label={`${platform}发布软文`}
              value={active.body[platform]}
              onChange={() => undefined}
              readOnly
            />
            <div className="text-meta">
              <span>{Array.from(active.body[platform]).length} 字</span>
              <span>语气：自然分享</span>
            </div>
          </article>

          <article className="publish-card topic-card">
            <div className="publish-card-title">
              <div>
                <span>相关话题</span>
                <small>热门词 × 精准词 × 品牌词</small>
              </div>
              <button onClick={() => copyText(active.tags.join(" "), "tags")}>
                {copied === "tags" ? "已复制" : "复制话题"}
              </button>
            </div>
            <div className="topic-list">
              {active.tags.map((tag, index) => (
                <button key={tag} onClick={() => copyText(tag, `tag-${index}`)}>
                  <span>{index < 2 ? "热" : index === 4 ? "品" : "准"}</span>
                  {tag}
                  <i>＋</i>
                </button>
              ))}
            </div>
            <p className="beta-note">初版使用内置相关词库；接入实时数据后可显示平台热度。</p>
          </article>
        </div>

        <div className="export-bar">
          <div>
            <span className="export-check">✓</span>
            <div>
              <strong>方案已整理完成</strong>
              <small>封面标题 + {platform}正文 + 5个相关话题</small>
            </div>
          </div>
          <button onClick={exportAll}>
            {copied === "all" ? "整套内容已复制" : "一键复制整套内容"}
          </button>
        </div>
      </section>

      <footer>
        <span>NBO 灵感封面 · 初步体验版</span>
        <span>让每次发布都有清晰重点</span>
      </footer>
    </main>
  );
}
