module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Metro 번들러는 import.meta를 지원하지 않으므로 빈 객체로 대체한다.
      // (zod v4 등 ESM 패키지가 import.meta.env를 사용함)
      function importMetaPlugin() {
        return {
          visitor: {
            MetaProperty(path) {
              if (
                path.node.meta.name === 'import' &&
                path.node.property.name === 'meta'
              ) {
                path.replaceWithSourceString('({ env: {}, url: "" })');
              }
            },
          },
        };
      },
    ],
  };
};
