# Gatsby Remark MakeCode plugin

Renders MakeCode code snippets into images as part of the Gatsby build.

## Adding plugin to Gastby

* add plugin

```
npm install --save gatsby-remark-makecode
```

or

```
yarn add gatsby-remark-makecode
```

* add playwright dependency to your project (full or core)

## Configuring the plugin

* add entry in remark section **before** any image processing pluging

```
    "gatsby-remark-makecode",
```

## Using the plugin

In your .md, .mdx files, you can insert JavaScript snippets to be rendered in blocks.

    ```blocks
    let x = 0
    ```

## Development

* install node.js and yarn globally
* build

```
yarn build
```

* watch

```
yarn watch
```

## Skinning

Classes

* ``makecode`` on the container
* ``blocks`` on the image

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
