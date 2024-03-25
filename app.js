const express = require("express");
const path = require("path");
const logger = require("morgan");
const { Telegraf } = require("telegraf");
const { Kafka } = require("kafkajs");

const TelegramManager = require("./functions/telegram-manager");
const { scheduleJob } = require("node-schedule");
const { sanitizeJson } = require("./functions/sanitize-json");
const { processDatabases } = require("./functions/process");

// Load environment variables
require("dotenv").config();

// Express setup
const app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");
app.use(logger("dev"));

// Bot setup and launch
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => ctx.reply("Hello, I'm Database Change bot~"));
bot.on("sticker", (ctx) => ctx.reply("👍"));
bot.launch();

// Start the server
const port = process.env.PORT || 3004;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const telegramManager = new TelegramManager(bot, undefined, undefined);

// Start the database processing
processDatabases(telegramManager).catch(console.error);

// Schedule the telegram bot to send a message every 1 seconds
scheduleJob("*/1 * * * * *", async function () {
  telegramManager.sendOneMessage(true);
});

// Initialize Kafka consumer
const kafka = new Kafka({
  clientId: "botClientDt",
  brokers: process.env.KAFKA_BROKER.split(","),
});
const consumer = kafka.consumer({ groupId: "botGroup" });
const run = async () => {
  await consumer.connect();

  // Lấy danh sách tất cả các topic
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

  // Subscribe vào các topic không bị loại trừ
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

run().catch(console.error);

module.exports = app;
