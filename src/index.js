"use strict";

const visit = require(`unist-util-visit`);
const makecode = require("./makecode-headless");

const validLanguages = [`blocks`];

/*
const remark = require("remark") 
{
const tree = remark().parse("![Caption](./imageurl.png)")
visit(tree, "image", console.log)
}
{
  const tree = remark().parse(
`
\`\`\`blocks
let x = 0
\`\`\`
`

  )
  visit(tree, "code", console.log)
  }
*/

module.exports = async ({
  markdownAST
}, pluginOptions = {}) => {
  const url = "https://makecode.microbit.org/beta";
  await makecode.init({
    url,
    cache: "./.cache/makecode"
  });
/*
  {
    type: 'code',
    lang: 'blocks',
    value: 'let x = 0'
  }
*/  
  let codeNodes = [];
  visit(markdownAST, `code`, node => {
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
      const fn = await makecode.render({
        code: value
      });
      console.log(`mkcd: img ${fn}`)
      
      // mutate the current node, converting from a code block to markdown image tag
      /*
{
  type: 'image',
  title: null,
  url: './imageurl.png',
  alt: 'Caption',
  position: [Position]
}

       */

      node.type = `image`;
      node.url = fn
      node.value = undefined;
    } catch (error) {
      console.log(`Error during makecode execution. Leaving code block unchanged`);
      console.log(error);
    }

    return node;
  }));
};