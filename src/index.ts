const visit = require(`unist-util-visit`);
const makecode = require("./makecode-headless");

const validLanguages = [`blocks`];

module.exports = async (
    { markdownAST },
    pluginOptions: { editorUrl?: string } = {}
) => {
    const url = pluginOptions?.editorUrl || "https://makecode.microbit.org/";
    await makecode.init({
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
                const rendered = await makecode.render({
                    code: value,
                    options: {
                        pixelDensity: 1,
                    },
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
