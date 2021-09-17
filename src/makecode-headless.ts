import * as puppeteer from "puppeteer";
import * as nodeCrypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as sharp from "sharp";

let initPromise: Promise<void>;

let editorUrl: string;
let lang: string;
let imagePath: string;

let browser;
let page;

const renderedCache: {
    [id: string]: RenderResult;
} = {};
let pendingRequests: {
    [id: string]: {
        resolve: (r: RenderRequest) => void;
        req: any;
    };
} = {};
let puppeteerVersion: string;
let makecodeVersion: string;

export interface RenderRequest {}

export interface RenderResult {
    req: RenderRequest;
    url: string;
    width: number;
    height: number;
}

const hash = (req: RenderRequest) =>
    nodeCrypto
        .createHash("md5")
        .update(
            [
                JSON.stringify(req),
                editorUrl,
                makecodeVersion,
                puppeteerVersion,
                lang || "en",
            ].join()
        )
        .digest("hex");

const cacheName = (id: string) => path.join(imagePath, id + ".png");

export function render(options: RenderRequest): Promise<RenderResult> {
    const id = hash(options);
    const cached = renderedCache[id];
    if (cached) return Promise.resolve(cached);
    console.debug(`mkcd: new snippet ${id}`);
    const req = JSON.parse(JSON.stringify(options));
    req.type = "renderblocks";
    req.id = id;
    req.options = req.options || {};

    return new Promise((resolve, reject) => {
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
    // id is the hash of the request
    const { id, uri } = msg;
    const pngPrefix = "data:image/png;base64,";
    const fpng = cacheName(id);

    //console.debug(`mkcd: save ${fpng}`);
    if (uri.indexOf(pngPrefix) === 0) {
        const data = Buffer.from(uri.slice(pngPrefix.length), "base64");
        sharp(data).resize(undefined, msg.height).toFile(fpng);
    } else {
        throw Error("not supported");
    }
    return fpng;
};

/**
 * Initializes the makecode rendering engine
 * @param options
 * @returns
 */
export function init(options: { url: string; cache: string; lang?: string }) {
    return (
        initPromise ||
        (initPromise = new Promise((resolve) => {
            console.debug(`mkcd: initializing`);

            editorUrl = options.url;
            imagePath = options.cache;
            lang = options.lang;

            (async () => {
                console.info(`mkcd: storing images in ${imagePath}`);
                if (!fs.existsSync(imagePath))
                    fs.mkdirSync(imagePath, { recursive: true });
                browser = await puppeteer.launch({ headless: true });
                puppeteerVersion = await browser.version();
                console.info(`mkcd: browser ${puppeteerVersion}`);
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
                            const id = msg.id; // this is the id you sent
                            const r = pendingRequests[id];
                            //console.debug(`mkcd: received ${id}, ${r}`);
                            if (!r) return;
                            delete pendingRequests[id];
                            // render to file
                            const fn = saveReq(msg);
                            // return and cache
                            r.resolve(
                                (renderedCache[id] = {
                                    req: r.req,
                                    url: fn
                                        .replace(/^(static|public)/, "")
                                        .replace(/\\/g, "/"),
                                    width: msg.width,
                                    height: msg.height,
                                })
                            );
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
