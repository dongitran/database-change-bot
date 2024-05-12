const Redis = require("ioredis");

let redis;

exports.connect = () => {
  redis = new Redis({
    port: Number(process.env.REDIS_PORT),
    host: String(process.env.REDIS_HOST),
    password: String(process.env.REDIS_PASSWORD),
    db: 0,
  });
};

exports.pushToQueue = (queueName, data) => {
  const jsonData = JSON.stringify(data);
  redis.rpush(queueName, jsonData, (err, result) => {
    if (err) {
      console.error("Error push to queue:", err);
    } else {
      console.log("Pushed to queue:", result);
    }
  });
};
