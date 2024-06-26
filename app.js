const express = require("express");
const path = require("path");
const logger = require("morgan");
const { Telegraf } = require("telegraf");
const TelegramManager = require("./functions/telegram-manager");
const { scheduleJob } = require("node-schedule");
const { databaseListener } = require("./services/database-listener");
const { kafkaListener } = require("./services/kafka-listener");
const { insertMongo, initMongo } = require("./functions/logger");
const redis = require("./functions/redis");

// Load environment variables
require("dotenv").config();

initMongo().then(() => {
  insertMongo("log", { message: "Server started" });
});

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

const telegramManager = new TelegramManager(bot, undefined, undefined);

// Initialize database listener to listen for database changes
databaseListener(telegramManager).catch(console.error);

// Initialize Kafka consumer to listen for messages
kafkaListener(telegramManager).catch(console.error);

// Schedule the telegram bot to send a message every 1 seconds
scheduleJob("*/1 * * * * *", async function () {
  telegramManager.sendOneMessage(true);
});

redis.connect();
setTimeout(() => {
  redis.pushToQueue("test", { message: "Hello, Redis!" });
}, 3000);

module.exports = app;
