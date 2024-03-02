const { isEqual, isObject, transform } = require("lodash");

exports.getDifferences = (obj1, obj2) => {
  function differences(base, object, basePath = "") {
    return transform(object, (result, value, key) => {
      const newPath = basePath ? `${basePath}.${key}` : key;
      if (!isEqual(value, base[key])) {
        if (isObject(value) && isObject(base[key])) {
          const subDiff = differences(base[key], value, newPath);
          // Kiểm tra nếu kiểu dữ liệu khác nhau giữa các object con, trả về toàn bộ object con từ json2
          if (!isEqual(subDiff, {}) || typeof base[key] !== typeof value) {
            result[key] = value;
          } else if (!isEqual(subDiff, {})) {
            result[key] = subDiff;
          }
        } else {
          // Kiểm tra kiểu dữ liệu khác nhau ở cùng một cấp độ
          if (typeof base[key] !== typeof value) {
            // Nếu có sự khác biệt về kiểu dữ liệu tại cùng một cấp, trả về giá trị từ json2
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

/*
// Testing the function with the provided examples
const json1_v1 = {
  "test": 1,
  "group": {
    "test2": 1,
    "test3": {
      "test4": 1
    }
  }
};

const json2_v1 = {
  "test": 1,
  "group": {
    "test2": 1,
    "test3": {
      "test4": 'abc'
    }
  }
};

const json1_v2 = {
  "a1": "abc",
  "bkkl": {
    "dc": 1,
    "test3": {
      "test4": 1
    }
  },
  "akks": "2"
};

const json2_v2 = {
  "a1": "abc",
  "bkkl": {
    "dc": {
      "k9js": {
        "tk5m": 1
      }
    },
    "test3": {
      "test4": 1
    }
  },
  "akks": "5"
};

const json1_v3 = {
  "a1": "abc",
  "bkkl": {
    "dc": 1,
    "test3": {
      "test4": 1
    },
    "as3": "2"
  },
  "akks": "2"
};

const json2_v3 = {
  "a1": "abc",
  "bkkl": {
    "dc": {
      "k9js": {
        "tk5m": 1
      }
    },
    "as3": "2"
  },
  "akks": "5"
};

console.log(findDifferences(json1_v1, json2_v1));
console.log(JSON.stringify(findDifferences(json1_v2, json2_v2), null, 2));
console.log(JSON.stringify(findDifferences(json1_v3, json2_v3), null, 2));
*/
