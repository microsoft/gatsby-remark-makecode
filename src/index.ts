const visit = require(`unist-util-visit`);
import { init, render } from "./makecode-headless";
const fetch = require("node-fetch");

let jacdacExtensions: any;
let jacdacVersion: string;
async function fetchJacdacInfo() {
    jacdacExtensions = await (
        await fetch(
            "https://raw.githubusercontent.com/microsoft/jacdac/main/services/makecode-extensions.json"
        )
    ).json();
    jacdacVersion = (
        await (
            await fetch(
                "https://raw.githubusercontent.com/microsoft/pxt-jacdac/master/pxt.json"
            )
        ).json()
    ).version;

    console.debug(`mkcd: jacdac version ${jacdacVersion}`);
    return { jacdacExtensions, jacdacVersion };
}
const jacdacInfoPromise = fetchJacdacInfo();

const validLanguages = [`blocks`];

function unique(values: string[]): string[] {
    return Array.from(new Set(values).keys());
}

function parseSnippet(source: string) {
    let code = "";
    const meta: {
        editor?: string;
        snippet?: boolean;
        dependencies: string[];
    } = {
        dependencies: [],
    };

    if (/^-----\n/.test(source)) {
        let front: string;
        const parts = source.replace(/^-----\n/, "").split(/-----\n/gm);
        switch (parts.length) {
            case 1:
                front = undefined;
                code = source;
                break;
            default:
                [front, code] = parts;
                break;
        }

        // parse front matter
        front?.replace(/([a-z0-9]+):\s*(.+)\s*\n/g, (m, name, value) => {
            switch (name) {
                case "dep":
                    meta.dependencies.push(value);
                    break;
                case "snippet":
                    meta.snippet = !!value;
                    break;
                case "editor":
                    meta.editor = value;
                    break;
                default:
                    meta[name] = value;
            }
            return "";
        });
    } else {
        code = source;
    }

    // sniff services
    const src = code;
    const mkcds = jacdacExtensions;
    mkcds
        .filter((info) => {
            return (
                src.indexOf(info.client.qName) > -1 ||
                (info.client.default && src.indexOf(info.client.default) > -1)
            );
        })
        .map(
            (info) =>
                `${info.client.name.replace(/^pxt-/, "")}=github:${
                    info.client.repo
                }#v${jacdacVersion}`
        )
        .forEach((dep) => meta.dependencies.push(dep));

    // add jacdac by default
    if (!meta.dependencies.length)
        meta.dependencies.push(
            `jacdac=github:microsoft/pxt-jacdac#v${jacdacVersion}`
        );

    // ensure unique deps
    meta.dependencies = unique(meta.dependencies);

    // sniff target
    if (!meta.editor) {
        if (/basic\.show/.test(src)) meta.editor = "microbit";
    }

    return {
        code,
        meta,
    };
}

module.exports = async (
    { markdownAST },
    pluginOptions: { editorUrl?: string } = {}
) => {
    const url = pluginOptions?.editorUrl || "https://makecode.microbit.org/";
    await jacdacInfoPromise;
    await init({
        url,
        cache: "./public/images/makecode",
        extraCacheKey: `jacdac: ${jacdacVersion}, extensions: ${jacdacExtensions}`,
    });
    /*
  {
    type: 'code',
    lang: 'blocks',
    value: 'let x = 0'
  }
*/
    const codeNodes = [];
    visit(markdownAST, `code`, (node) => {
        const chunks = (node.lang || ``).match(/^(\S+)(\s+(.+))?/);

        if (!chunks || !chunks.length) {
            return node;
        }

        const lang = chunks[1];
        const attrString = chunks[3];
        if (validLanguages.includes(lang)) {
            node.lang = lang;
            codeNodes.push({
                node,
                attrString: attrString,
            });
        }

        return node;
    });
    await Promise.all(
        codeNodes.map(async ({ node }) => {
            const { value: source } = node;

            try {
                const { code, meta } = parseSnippet(source);
                const options = {
                    pixelDensity: 1,
                    package: meta.dependencies.join(","),
                };
                //console.debug(`makecode snippet`, options);
                const rendered = await render({
                    code,
                    options,
                });
                // store rendered in node
                node.value = JSON.stringify({
                    source,
                    rendered,
                });
                //node.html = `html`;
                //node.value = `<div class="makecode"><img class="blocks" src="${url}" height=${height}" alt="MakeCode code snippet" loading="lazy" /></div>`
            } catch (error) {
                console.log(
                    `Error during makecode execution. Leaving code block unchanged`
                );
                console.log(error);

                node.value = JSON.stringify({
                    source,
                });
            }

            return node;
        })
    );
};
