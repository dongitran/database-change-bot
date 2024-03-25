const { Kafka } = require("kafkajs");
const { sanitizeJson } = require("../functions/sanitize-json");

exports.kafkaListener = async (telegramManager) => {
  const kafka = new Kafka({
    clientId: "botClientDt",
    brokers: process.env.KAFKA_BROKER.split(","),
  });
  const consumer = kafka.consumer({ groupId: "botGroup" });
  await consumer.connect();

  const admin = kafka.admin();
  await admin.connect();
  const topicsDetail = await admin.listTopics();
  const excludedTopics = [
    "strimzi.cruisecontrol.metrics",
    "strimzi.cruisecontrol.modeltrainingsamples",
    "strimzi.cruisecontrol.partitionmetricsamples",
    "__consumer_offsets",
  ];
  const topicsToSubscribe = topicsDetail.filter(
    (topic) => !excludedTopics.includes(topic)
  );

  await consumer.subscribe({ topics: topicsToSubscribe, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const result = {
        topic,
        partition,
        offset: message.offset,
        value: JSON.parse(message.value.toString()),
      };
      const jsonObj = `\`\`\`json\n${JSON.stringify(
        sanitizeJson(result),
        null,
        2
      )}\n\`\`\``;
      if (jsonObj.length < 4096) {
        telegramManager.appendMessage(
          jsonObj,
          process.env.KAFKA_TELEGRAM_GROUP_ID,
          process.env.KAFKA_TELEGRAM_TOPIC_ID
        );
      }
    },
  });

  await admin.disconnect();
};
