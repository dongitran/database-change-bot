var express = require("express");
var path = require("path");
var logger = require("morgan");
const { Telegraf } = require("telegraf");
require("dotenv").config();
const { Client } = require("pg");
const { getDifferences } = require("./functions/get-diff-json");

var app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");
app.use(logger("dev"));

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => ctx.reply("Hello, I'm Database Change bot~"));
bot.on("sticker", (ctx) => ctx.reply("👍"));
bot.launch();

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const client = new Client({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  port: process.env.POSTGRES_PORT,
});
client.connect();

client.query("LISTEN tbl_customers_change");

client.on("notification", async (msg) => {
  console.log("Received notification:", msg);
  const payload = JSON.parse(msg.payload);
  const action = payload.action;
  console.log(action, "action");
  switch (String(action).toUpperCase()) {
    case "INSERT": {
      const message = `Có sự thêm mới trong table:\n\`\`\`json\n${JSON.stringify(
        payload.data,
        null,
        2
      )}\n\`\`\``;
      await bot.telegram.sendMessage(process.env.TELEGRAM_GROUP_ID, message, {
        parse_mode: "MarkdownV2",
      });
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
      const message = `Update *${table}*:\n\`\`\`json\n${JSON.stringify(
        updateData,
        null,
        2
      )}\n\`\`\``;
      await bot.telegram.sendMessage(process.env.TELEGRAM_GROUP_ID, message, {
        parse_mode: "MarkdownV2",
      });
      break;
    }
  }
});

module.exports = app;
