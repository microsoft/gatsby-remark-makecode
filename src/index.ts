const visit = require(`unist-util-visit`);
import { init, render } from "./makecode-headless";
const fetch = require("node-fetch");

let jacdacExtensions: any;
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
                }`
        )
        .forEach((dep) => (dependencies[dep] = "1"));

    const deps = Object.keys(dependencies);
    if (deps.length) deps.unshift("jacdac=github:microsoft/pxt-jacdac");
    return deps.join(",");
};

module.exports = async (
    { markdownAST },
    pluginOptions: { editorUrl?: string } = {}
) => {
    const url = pluginOptions?.editorUrl || "https://makecode.microbit.org/";
    const resp = await fetch(
        "https://raw.githubusercontent.com/microsoft/jacdac/main/services/makecode-extensions.json"
    );
    jacdacExtensions = await resp.json();
    await init({
        url,
        cache: "./public/images/makecode",
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
            const { value, lang } = node;

            try {
                const options = {
                    pixelDensity: 1,
                    package: sniffPackages(value),
                };
                //console.debug(`makecode snippet`, options);
                const rendered = await render({
                    code: value,
                    options,
                });
                // store rendered in node
                node.value = JSON.stringify({
                    source: node.value,
                    rendered,
                });
                //node.html = `html`;
                //node.value = `<div class="makecode"><img class="blocks" src="${url}" height=${height}" alt="MakeCode code snippet" loading="lazy" /></div>`
            } catch (error) {
                console.log(
                    `Error during makecode execution. Leaving code block unchanged`
                );
                console.log(error);
            }

            return node;
        })
    );
};
