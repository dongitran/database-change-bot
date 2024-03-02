const express = require("express");
const path = require("path");
const logger = require("morgan");
const { Telegraf } = require("telegraf");
const fs = require("fs");

const { getDifferences } = require("./functions/get-diff-json");
const { setupDatabase } = require("./functions/setup-db");

// Load environment variables
require("dotenv").config();

// Express setup
const app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");
app.use(logger("dev"));

// Bot setup
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => ctx.reply("Hello, I'm Database Change bot~"));
bot.on("sticker", (ctx) => ctx.reply("👍"));
bot.launch();

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Load database configurations
const dbConfigs = JSON.parse(
  fs.readFileSync(path.join(__dirname, "config.json"), "utf-8")
);

// Database setup and notification handling
const clients = [];
async function processDatabases() {
  for (const config of dbConfigs) {
    const client = await setupDatabase(config);
    clients.push(client);
  }

  for (const client of clients) {
    client.query("LISTEN tbl_changes");

    client.on("notification", async (msg) => {
      console.log("Received notification:", msg);
      const payload = JSON.parse(msg.payload);
      const action = payload.action;

      switch (String(action).toUpperCase()) {
        case "INSERT": {
          const table = (payload?.table_name || "").replace(/_/g, `\\_`);
          const message = `Insert *${table}*:\n\`\`\`json\n${JSON.stringify(
            payload.data,
            null,
            2
          )}\n\`\`\``;
          await bot.telegram.sendMessage(
            process.env.TELEGRAM_GROUP_ID,
            message,
            {
              parse_mode: "MarkdownV2",
            }
          );
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
          await bot.telegram.sendMessage(
            process.env.TELEGRAM_GROUP_ID,
            message,
            {
              parse_mode: "MarkdownV2",
            }
          );
          break;
        }
      }
    });
  }

  console.log(clients.length, "49aksf");
}

processDatabases().catch(console.error);

module.exports = app;
