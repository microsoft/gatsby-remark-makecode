import { chromium, Browser, Page } from "playwright";
import * as nodeCrypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as sharp from "sharp";

let initPromise: Promise<void>;

let editorUrl: string;
let lang: string;
let imagePath: string;
let extraCacheKey: string;

let browser: Browser;
let page: Page;

let pendingRequests: {
    [id: string]: {
        resolve: (r: RenderRequest) => void;
        req: any;
    };
} = {};
let playwrightVersion: string;
let makecodeVersion: string;

export type RenderRequest = any;

export interface RenderResult {
    req: RenderRequest;
    url: string;
}

const hash = (req: RenderRequest) =>
    nodeCrypto
        .createHash("sha256")
        .update(
            [
                JSON.stringify(req),
                editorUrl,
                makecodeVersion,
                playwrightVersion,
                extraCacheKey,
                lang || "en",
            ].join()
        )
        .digest("hex");

const cacheName = (id: string) => path.join(imagePath, id + ".png");

export function render(options: RenderRequest): Promise<RenderResult> {
    const id = hash(options);

    const req = JSON.parse(JSON.stringify(options));
    req.type = "renderblocks";
    req.id = id;
    req.options = req.options || {};

    const fpng = cacheName(id);
    if (fs.existsSync(fpng)) {
        console.debug(`mkcd: cached snippet ${id}`);
        return Promise.resolve({ req, url: fileToUrl(fpng) });
    }

    const pending = pendingRequests[req.id];
    if (pending) {
        console.debug(`mkcd: pending snippet ${id}`);
        return new Promise((resolve) => {
            const old = pending.resolve;
            pending.resolve = (value) => {
                old(value);
                resolve(value);
            };
        });
    }

    const npending = Object.keys(pendingRequests).length;
    console.debug(`mkcd: new snippet ${id} (${npending} pending)`);

    return new Promise((resolve) => {
        pendingRequests[req.id] = {
            req,
            resolve,
        };
        page.evaluate(async (msg) => {
            const docs = document.getElementById("docs") as HTMLIFrameElement;
            docs.contentWindow.postMessage(msg, "*");
        }, req);
    });
}

const saveReq = (msg) => {
    const { id, uri } = msg;
    const pngPrefix = "data:image/png;base64,";
    const fpng = cacheName(id);

    if (uri.indexOf(pngPrefix) === 0) {
        const data = Buffer.from(uri.slice(pngPrefix.length), "base64");
        sharp(data).resize(undefined, msg.height).toFile(fpng);
    } else {
        throw Error("not supported");
    }
    return fpng;
};

function fileToUrl(fn: string) {
    return fn.replace(/^(static|public)/, "").replace(/\\/g, "/");
}

/**
 * Initializes the makecode rendering engine
 * @param options
 * @returns
 */
export function init(options: {
    url: string;
    cache: string;
    lang?: string;
    extraCacheKey?: string;
}) {
    return (
        initPromise ||
        (initPromise = new Promise((resolve) => {
            console.debug(`mkcd: initializing`);

            editorUrl = options.url;
            imagePath = options.cache;
            lang = options.lang;
            extraCacheKey = options.extraCacheKey;

            (async () => {
                console.info(`mkcd: storing images in ${imagePath}`);
                if (!fs.existsSync(imagePath))
                    fs.mkdirSync(imagePath, { recursive: true });
                browser = await chromium.launch({ headless: true });
                playwrightVersion = browser.version();
                console.info(`mkcd: browser ${playwrightVersion}`);
                page = await browser.newPage();
                page.on("console", (msg) => console.log(msg.text()));
                await page.exposeFunction("ssrPostMessage", (msg) => {
                    if (msg.source != "makecode") return;
                    switch (msg.type) {
                        case "renderready": {
                            makecodeVersion = JSON.stringify(msg.versions);
                            pendingRequests = {};
                            console.info(
                                `mkcd: renderer ready (${
                                    msg.versions?.tag || "v?"
                                })`
                            );
                            resolve();
                            break;
                        }
                        case "renderblocks": {
                            const id = msg.id;
                            const r = pendingRequests[id];
                            if (!r) return;
                            delete pendingRequests[id];
                            const fn = saveReq(msg);
                            const np = Object.keys(pendingRequests).length;
                            console.debug(`mkcd: done ${fn} (${np} pending)`);
                            r.resolve({
                                req: r.req,
                                url: fileToUrl(fn),
                            });
                            break;
                        }
                    }
                });
                let rendererUrl = `${editorUrl}---docs?render=1&dbg=1`;
                if (lang) rendererUrl = `&lang=${lang}`;
                const html = `<body>
      <iframe id="docs" src="" style="left: 0; top: 0; width: 100%; height: 100%; position: absolute; border: none;"></iframe>
      <script>
          window.addEventListener("message", msg => {
              window.ssrPostMessage(msg.data)
          }, false);
          const docs = document.getElementById("docs")
          docs.src="${rendererUrl}"
      </script>
      </body>`;
                console.info(`mkcd: loading ${rendererUrl}`);
                await page.setContent(html);
            })();
        }))
    );
}