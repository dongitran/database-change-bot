const express = require("express");
const path = require("path");
const logger = require("morgan");
const { Telegraf } = require("telegraf");
const { Client } = require("pg");
const { getDifferences } = require("./functions/get-diff-json");

require("dotenv").config();

const app = express();
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

async function setupDatabase() {
  await client.connect();

  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION notify_change()
    RETURNS TRIGGER AS $$
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', 'delete',
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'data', row_to_json(OLD)
            )::text);
        ELSIF (TG_OP = 'UPDATE') THEN
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', 'update',
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'new_data', row_to_json(NEW),
                'old_data', row_to_json(OLD)
            )::text);
        ELSE
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', TG_OP,
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'data', row_to_json(NEW)
            )::text);
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await client.query(createFunctionSQL);

  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  `);

  for (let row of tablesRes.rows) {
    const tableName = row.table_name;
    const triggerName = `trigger_${tableName}_change`;
    await client.query(`
      DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
      CREATE TRIGGER ${triggerName}
      AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
      FOR EACH ROW EXECUTE FUNCTION notify_change();
    `);
  }

  console.log('Database setup complete with triggers for all tables.');
}

setupDatabase().catch(console.error);

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
