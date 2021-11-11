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

const sniffPackages = (src: string) => {
    const dependencies = {};
    jacdacExtensions
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
        .forEach((dep) => (dependencies[dep] = "1"));

    const deps = Object.keys(dependencies);
    if (deps.length)
        deps.unshift(`jacdac=github:microsoft/pxt-jacdac#v${jacdacVersion}`);
    return deps.join(",");
};

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
        codeNodes.map(async ({ node, attrString }) => {
            const { value: source, lang } = node;

            try {
                const options = {
                    pixelDensity: 1,
                    package: sniffPackages(source),
                };

                //console.debug(`makecode snippet`, options);
                const rendered = await render({
                    code: source,
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
