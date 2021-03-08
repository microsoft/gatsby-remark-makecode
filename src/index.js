"use strict";

const visit = require(`unist-util-visit`);
const cheerio = require(`cheerio`);
const makecode = require("./makecode-headless");

const validLanguages = [`blocks`];

module.exports = async ({
  markdownAST
}, pluginOptions = {}) => {
  await makecode.init({
    url: "https://makecode.microbit.org/beta",
    path: ".cache/makecode"
  });
  let codeNodes = [];
  visit(markdownAST, `code`, node => {
    const chunks = (node.lang || ``).match(/^(\S+)(\s+(.+))?/);

    if (!chunks || !chunks.length) {
      return node;
    }

    const lang = chunks[1];
    const attrString = chunks[3]; // Only act on languages supported by graphviz

    if (validLanguages.includes(lang)) {
      node.lang = lang;
      codeNodes.push({
        node,
        attrString: attrString
      });
    }

    return node;
  });
  await Promise.all(codeNodes.map(async ({
    node,
    attrString
  }) => {
    const {
      value,
      lang
    } = node;

    try {
      // Perform actual render
      const resp = await makecode.render({
        code: value
      });
      const id = resp.id;
      const dataUri = resp.uri; // Add default inline styling

      console.log(`mkcd: img ${id} ${(dataUri.length / 1000 >> 0)}kb`)


      const $ = cheerio.load(`<img src="${dataUri}" />`);
      $(`img`).attr(`style`, `max-width: 100%; height: auto;`); // Merge custom attributes if provided by user (adds and overwrites)

      if (attrString) {
        const attrElement = cheerio.load(`<element ${attrString}></element>`);
        $(`img`).attr(attrElement(`element`).attr());
      } // Mutate the current node. Converting from a code block to
      // HTML (with svg content)


      node.type = `html`;
      node.value = $.html(`img`);
    } catch (error) {
      console.log(`Error during makecode execution. Leaving code block unchanged`);
      console.log(error);
    }

    return node;
  }));
};