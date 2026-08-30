/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  ACCESS_PASSWORD: string;
  ACCESS_TOKEN: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env | undefined, ctx: ExecutionContext): Promise<Response> {
    const runtimeEnv: Partial<Env> = env ?? {};
    const url = new URL(request.url);

    if (url.pathname === "/__nbo_unlock" && request.method === "POST") {
      const form = await request.formData();
      const submittedPassword = String(form.get("password") ?? "");

      if (safeEqual(submittedPassword, runtimeEnv.ACCESS_PASSWORD ?? "")) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: "/",
            "Set-Cookie": [
              `nbo_access=${encodeURIComponent(runtimeEnv.ACCESS_TOKEN ?? "")}`,
              "Path=/",
              "HttpOnly",
              "Secure",
              "SameSite=Lax",
              "Max-Age=15552000",
            ].join("; "),
            "Cache-Control": "no-store",
          },
        });
      }

      return passwordPage(true);
    }

    if (!hasValidAccessCookie(request, runtimeEnv.ACCESS_TOKEN ?? "")) {
      return passwordPage(false);
    }

    if (url.pathname === "/_vinext/image") {
      const assets = runtimeEnv.ASSETS;
      const images = runtimeEnv.IMAGES;
      if (!assets || !images) {
        return new Response("图片处理服务暂不可用", { status: 503 });
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => assets.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, runtimeEnv as Env, ctx);
  },
};

export default worker;

function hasValidAccessCookie(request: Request, accessToken: string): boolean {
  if (!accessToken) return false;

  const cookieHeader = request.headers.get("Cookie") ?? "";
  const accessCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("nbo_access="));

  if (!accessCookie) return false;

  const cookieValue = accessCookie.slice("nbo_access=".length);
  return safeEqual(cookieValue, accessToken);
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function passwordPage(hasError: boolean): Response {
  const errorMessage = hasError
    ? '<p class="error" role="alert">密码不正确，请重新输入</p>'
    : '<p class="hint">首次输入后，这台设备将自动记住180天</p>';

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>NBO 灵感封面｜访问验证</title>
    <style>
      :root {
        color-scheme: light;
        --red: #ff2442;
        --ink: #202020;
        --muted: #7d7771;
        --line: #ece7e2;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        overflow: hidden;
        background:
          radial-gradient(circle at 85% 12%, rgba(255, 36, 66, .12), transparent 23rem),
          radial-gradient(circle at 5% 92%, rgba(255, 36, 66, .07), transparent 25rem),
          #faf9f7;
        color: var(--ink);
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      body::before {
        content: "15";
        position: fixed;
        right: -40px;
        bottom: -85px;
        color: rgba(255, 36, 66, .035);
        font: 900 250px/1 Arial, sans-serif;
        pointer-events: none;
      }
      .shell {
        width: min(100%, 440px);
        position: relative;
      }
      .brand {
        margin-bottom: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      .mark {
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        background: var(--red);
        color: white;
        font: 800 22px/1 Georgia, serif;
        box-shadow: 0 8px 20px rgba(255, 36, 66, .25);
      }
      .brand strong {
        font-size: 15px;
        letter-spacing: .02em;
      }
      .card {
        padding: 42px 38px 36px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: rgba(255, 255, 255, .96);
        box-shadow: 0 24px 65px rgba(55, 39, 34, .1);
        text-align: center;
      }
      .lock {
        width: 58px;
        height: 58px;
        margin: 0 auto 22px;
        display: grid;
        place-items: center;
        border-radius: 18px;
        background: #fff1f3;
        color: var(--red);
        font-size: 25px;
      }
      h1 {
        margin: 0;
        font-size: 27px;
        letter-spacing: -.035em;
      }
      .sub {
        margin: 10px 0 27px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.7;
      }
      label {
        display: block;
        color: #5f5a56;
        font-size: 12px;
        font-weight: 700;
        text-align: left;
      }
      input {
        width: 100%;
        height: 52px;
        margin-top: 9px;
        padding: 0 16px;
        border: 1px solid #ddd7d1;
        border-radius: 13px;
        outline: none;
        background: #fdfcfb;
        color: var(--ink);
        font-size: 18px;
        letter-spacing: .18em;
        transition: border-color .15s ease, box-shadow .15s ease;
      }
      input:focus {
        border-color: var(--red);
        box-shadow: 0 0 0 4px rgba(255, 36, 66, .08);
      }
      button {
        width: 100%;
        height: 50px;
        margin-top: 14px;
        border: 0;
        border-radius: 13px;
        background: var(--red);
        color: white;
        font: 700 14px/1 inherit;
        cursor: pointer;
        box-shadow: 0 10px 24px rgba(255, 36, 66, .2);
      }
      button:active { transform: translateY(1px); }
      .hint, .error {
        margin: 16px 0 0;
        font-size: 11px;
      }
      .hint { color: #9a948e; }
      .error { color: var(--red); }
      .privacy {
        margin: 18px 0 0;
        color: #aaa49f;
        font-size: 10px;
      }
      @media (max-width: 520px) {
        body { padding: 14px; }
        .card {
          padding: 36px 22px 30px;
          border-radius: 24px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="brand"><span class="mark">N</span><strong>NBO 灵感封面</strong></div>
      <section class="card">
        <div class="lock">●</div>
        <h1>请输入访问密码</h1>
        <p class="sub">这是南铂专用内容工作台<br />验证后即可进入</p>
        <form method="post" action="/__nbo_unlock">
          <label>
            访问密码
            <input
              name="password"
              type="password"
              inputmode="numeric"
              autocomplete="current-password"
              maxlength="20"
              autofocus
              required
            />
          </label>
          <button type="submit">验证并进入</button>
        </form>
        ${errorMessage}
        <p class="privacy">密码仅在服务器验证，不会保存在网页中</p>
      </section>
    </main>
  </body>
</html>`;

  return new Response(html, {
    status: hasError ? 401 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
