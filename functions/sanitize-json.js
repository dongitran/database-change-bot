exports.sanitizeJson = function sanitizeJson(obj) {
  if (typeof obj === "object" && obj !== null) {
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (typeof value === "string") {
        if (value.length > 64) {
          obj[key] = "";
        }
      } else if (typeof value === "object") {
        sanitizeJson(value);
      }
    });
  }
  return obj;
};
