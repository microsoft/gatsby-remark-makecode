const puppeteer = require("puppeteer")
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")
const { promisify } = require("util")

const writeFile = promisify(fs.writeFile)

let initPromise
let browser
let page
let pendingRequests = {}
let imagePath

const hash = req =>
    crypto.createHash("md5").update(JSON.stringify(req)).digest("hex")

exports.render = req => {
    const id = hash(req)

    req = JSON.parse(JSON.stringify(req))
    req.type = "renderblocks"
    req.id = id
    req.options = req.options || {}
    return new Promise((resolve, reject) => {
        pendingRequests[req.id] = {
            req,
            resolve,
        }
        page.evaluate(async msg => {
            const docs = document.getElementById("docs")
            docs.contentWindow.postMessage(msg, "*")
        }, req)
    })
}

const saveReq = async msg => {
    const fsvg = path.join(imagePath, msg.id + ".svg");
    const fpng = path.join(imagePath, msg.id + ".png");
    await writeFile(fsvg, msg.svg, { encoding: "utf-8" })
    await sharp(fsvg)
        .png()
        .toFile(fpng)
}

/**
 * Loads the iframe in headless chrome
 * @param {*} options
 *
 *   {
 *      url: https://makecode.microbit.org/beta/,
 *      path: string
 *   }
 */

exports.init = options =>
    initPromise ||
    (initPromise = new Promise((resolve, reject) => {
        console.info(`mkcd: initializing ${options.url}`)
        ;(async () => {
            if (options.path) {
                imagePath = options.path
                console.info(`mkcd: storing images in ${imagePath}`)
                if (!fs.existsSync(imagePath))
                    fs.mkdirSync(imagePath, { recursive: true })
            }
            browser = await puppeteer.launch()
            page = await browser.newPage()
            page.on("console", msg => console.log(msg.text()))
            await page.exposeFunction("ssrPostMessage", msg => {
                if (msg.source != "makecode") return

                switch (msg.type) {
                    case "renderready": {
                        console.info(`mkcd: renderer ready`)
                        pendingRequests = {}
                        resolve()
                        break
                    }

                    case "renderblocks": {
                        const id = msg.id // this is the id you sent

                        const r = pendingRequests[id]
                        if (!r) return
                        delete pendingRequests[id]
                        console.info(`mkcd: rendered`, msg.id)

                        // render svg to png
                        if (imagePath) saveReq(msg)

                        r.resolve(msg)
                        break
                    }
                }
            })
            const rendererUrl = `${options.url}---docs?render=1`
            const html = `<body>
      <iframe id="docs" src=""></iframe>
      <script>
          window.addEventListener("message", msg => window.ssrPostMessage(msg.data), false);
          const docs = document.getElementById("docs")
          docs.src="${rendererUrl}"
      </script>
      </body>`
            console.info(`mkcd: loading ${rendererUrl}`)
            await page.setContent(html)
        })()
    }))