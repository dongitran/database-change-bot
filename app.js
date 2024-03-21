const express = require("express");
const path = require("path");
const logger = require("morgan");
const { Telegraf } = require("telegraf");
const fs = require("fs");
const { MongoClient } = require("mongodb");
const { Kafka } = require("kafkajs");

const { getDifferences } = require("./functions/get-diff-json");
const { setupDatabase } = require("./functions/setup-db");
const TelegramManager = require("./functions/telegram-manager");
const { scheduleJob } = require("node-schedule");
const { sanitizeJson } = require("./functions/sanitize-json");

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

// Database setup and notification handling
const postgresClients = [];
const mongoClients = [];
async function processDatabases() {
  // Load database configurations
  const dbConfigs = JSON.parse(
    fs.readFileSync(path.join(__dirname, "config.json"), "utf-8")
  );

  for (const configs of dbConfigs) {
    switch (configs?.type) {
      case "postgres": {
        for (const config of configs?.configs) {
          const client = await setupDatabase(config);
          postgresClients.push(client);
        }

        for (const client of postgresClients) {
          client.query("LISTEN tbl_changes");

          client.on("notification", async (msg) => {
            const payload = JSON.parse(msg.payload);
            const action = payload.action;

            // Find the config for the database that sent the notification
            // and send the notification to the Telegram topic
            const databaseName = payload?.database_name;
            const config = configs?.configs.find(
              (c) => c.database === databaseName
            );

            let message = "";
            switch (String(action).toUpperCase()) {
              case "INSERT": {
                const table = (payload?.table_name || "").replace(/_/g, `\\_`);
                message = `Insert *${table}*:\n\`\`\`json\n${JSON.stringify(
                  sanitizeJson(payload.data),
                  null,
                  2
                )}\n\`\`\``;

                break;
              }
              case "UPDATE": {
                const newData = payload?.new_data || [];
                const oldData = payload?.old_data || [];
                const updateData = {
                  id: payload?.new_data?.id,
                  ...getDifferences(oldData, newData),
                };
                const table = (payload?.table_name || "").replace(/_/g, `\\_`);
                message = `Update *${table}*:\n\`\`\`json\n${JSON.stringify(
                  updateData,
                  null,
                  2
                )}\n\`\`\``;

                break;
              }
            }

            // Append message to telegram manager to send
            telegramManager.appendMessage(
              message,
              configs?.telegramGroupId,
              config?.messageThreadId
            );
          });
        }
        break;
      }
      case "mongo": {
        for (const config of configs?.configs) {
          const client = new MongoClient(config.uri);
          await client.connect();
          mongoClients.push(client);

          const database = client.db(config.database);
          const changeStream = database.watch();

          changeStream.on("change", (change) => {
            const operationType = change.operationType;
            const fullDocument = change.fullDocument;
            const ns = change.ns;
            const collectionName = (ns.coll || "").replace(/_/g, `\\_`);

            let message;
            switch (operationType) {
              case "insert": {
                message = `Insert on *${collectionName}*:\n\`\`\`json\n${JSON.stringify(
                  sanitizeJson(fullDocument),
                  null,
                  2
                )}\n\`\`\``;
                break;
              }
              case "update": {
                const updateFields = change?.updateDescription?.updatedFields;
                const objResponse = {
                  _id: change?.documentKey?._id,
                  ...updateFields,
                };
                message = `Update on *${collectionName}*:\n\`\`\`json\n${JSON.stringify(
                  sanitizeJson(objResponse),
                  null,
                  2
                )}\n\`\`\``;
                break;
              }
            }

            // Append message to telegram manager to send
            telegramManager.appendMessage(
              message,
              configs?.telegramGroupId,
              config?.messageThreadId
            );
          });
        }
        break;
      }
    }
  }
}

// Start the database processing
processDatabases().catch(console.error);

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
