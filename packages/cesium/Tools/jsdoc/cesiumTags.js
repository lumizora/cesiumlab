// Minimal JSDoc tag plugin required by Cesium's tsd-conf.json for .d.ts generation.
exports.defineTags = function (dictionary) {
  dictionary.defineTag("demo", {
    onTagged: function (doclet, tag) {
      if (!doclet.demos) {
        doclet.demos = [];
      }
      doclet.demos.push(tag.value);
    },
  });

  dictionary.defineTag("performance", {
    onTagged: function (doclet, tag) {
      if (!doclet.performance) {
        doclet.performance = [];
      }
      doclet.performance.push(tag.value);
    },
  });

  dictionary.defineTag("experimental", {
    onTagged: function (doclet) {
      doclet.experimental = true;
    },
  });

  dictionary.defineTag("internal", {
    onTagged: function (doclet) {
      doclet.internal = true;
    },
  });

  dictionary.defineTag("import", {
    onTagged: function () {},
  });

  dictionary.defineTag("glsl", {
    onTagged: function (doclet) {
      doclet.glsl = true;
    },
  });

  dictionary.defineTag("optional", {
    onTagged: function (doclet) {
      doclet.optional = true;
    },
  });

  dictionary.defineTag("internalconstructor", {
    onTagged: function (doclet) {
      doclet.kind = "class";
      doclet.hideconstructor = true;
    },
  });

  dictionary.defineTag("privateparam", {
    onTagged: function () {},
  });
};
