export default {
  multipass: false,
  /* datauri: "base64", */
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          cleanupIds: false,
          removeHiddenElems: false,
          inlineStyles: false,
          removeComments: false
        }
      }
    }
  ]
};
