const { isEqual, isObject, transform } = require("lodash");

exports.getDifferences = (obj1, obj2) => {
  function differences(base, object, basePath = "") {
    return transform(object, (result, value, key) => {
      const newPath = basePath ? `${basePath}.${key}` : key;
      if (!isEqual(value, base[key])) {
        if (isObject(value) && isObject(base[key])) {
          const subDiff = differences(base[key], value, newPath);
          if (!isEqual(subDiff, {}) || typeof base[key] !== typeof value) {
            result[key] = value;
          } else if (!isEqual(subDiff, {})) {
            result[key] = subDiff;
          }
        } else {
          if (typeof base[key] !== typeof value) {
            result[key] = value;
          } else {
            result[key] = value;
          }
        }
      }
    });
  }
  return differences(obj1, obj2);
};
