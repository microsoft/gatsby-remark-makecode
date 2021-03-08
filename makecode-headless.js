"use strict";

const puppeteer = require("puppeteer");

const crypto = require("crypto");

const fs = require("fs");

const path = require("path");

let initPromise;
let browser;
let page;
let pendingRequests = {};
let imagePath;
let puppeteerVersion;
let makecodeVersion;

const hash = req => crypto.createHash("md5").update(JSON.stringify(req) + "|" + makecodeVersion + "|" + puppeteerVersion).digest("hex");

const cacheName = id => path.join(imagePath, id + ".png");

exports.render = req => {
  const id = hash(req);
  const fn = cacheName(id);
  console.debug(`mkcd: render ${id}`);

  if (fs.existsSync(fn)) {
    console.debug(`mkcd: cache hit ${fn}`);
    return fn;
  }

  console.debug(`mkcd: new snippet ${id}`);
  req = JSON.parse(JSON.stringify(req));
  req.type = "renderblocks";
  req.id = id;
  req.options = req.options || {};
  return new Promise((resolve, reject) => {
    pendingRequests[req.id] = {
      req,
      resolve
    };
    page.evaluate(async msg => {
      const docs = document.getElementById("docs");
      docs.contentWindow.postMessage(msg, "*");
    }, req);
  });
};

const saveReq = msg => {
  // id is the hash of the request
  const {
    id,
    uri
  } = msg;
  const pngPrefix = "data:image/png;base64,";
  const fpng = cacheName(id);
  console.log(`mkcd: save ${fpng}`);

  if (uri.indexOf(pngPrefix) === 0) {
    const data = Buffer.from(msg.uri, "base64");
    fs.writeFileSync(fpng, data, {
      encoding: "binary"
    });
  } else {
    throw Error("not supported");
  }

  return fpng;
};
/**
 * Loads the iframe in headless chrome
 * @param {*} options
 *
 *   {
 *      url: https://makecode.microbit.org/beta/,
 *      path: string
 *   }
 */


exports.init = options => initPromise || (initPromise = new Promise(resolve => {
  console.info(`mkcd: initializing ${options.url}`);
  imagePath = options.cache;

  (async () => {
    console.info(`mkcd: storing images in ${imagePath}`);
    if (!fs.existsSync(imagePath)) fs.mkdirSync(imagePath, {
      recursive: true
    });
    browser = await puppeteer.launch({
      headless: false
    });
    puppeteerVersion = await browser.version();
    console.info(`mkcd: browser ${puppeteerVersion}`);
    page = await browser.newPage();
    page.on("console", msg => console.log(msg.text()));
    await page.exposeFunction("ssrPostMessage", msg => {
      if (msg.source != "makecode") return;

      switch (msg.type) {
        case "renderready":
          {
            var _msg$versions;

            makecodeVersion = options.url + "|" + JSON.stringify(msg.versions) + "|";
            pendingRequests = {};
            console.info(`mkcd: renderer ready (${((_msg$versions = msg.versions) === null || _msg$versions === void 0 ? void 0 : _msg$versions.tag) || "v?"})`);
            resolve();
            break;
          }

        case "renderblocks":
          {
            const id = msg.id; // this is the id you sent

            const r = pendingRequests[id];
            console.debug(`mkcd: received ${id}, ${r}`);
            if (!r) return;
            delete pendingRequests[id]; // render to file

            const fn = saveReq(msg);
            console.info(`mkcd: rendered`, fn);
            r.resolve(fn);
            break;
          }
      }
    });
    const rendererUrl = `${options.url}---docs?render=1&dbg=1`;
    const html = `<body>
      <iframe id="docs" src=""></iframe>
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
}));