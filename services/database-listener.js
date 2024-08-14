const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { getDifferences } = require("../functions/get-diff-json");
const { setupDatabase } = require("../functions/setup-db");
const { sanitizeJson } = require("../functions/sanitize-json");
const { Kafka } = require("kafkajs");

exports.databaseListener = async (telegramManager) => {
  // Initialize the clients for the databases
  const postgresClients = [];
  const mongoClients = [];
  // Load database configurations
  const dbConfigs = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config.json"), "utf-8")
  );

  // Init Kafka producer
  const kafka = new Kafka({
    clientId: "botClientDt02",
    brokers: process.env.KAFKA_PRODUCER_BROKER_DB_CHANGE.split(","),
  });
  const producer = kafka.producer();
  const sendMessage = async (topic, messages) => {
    try {
      await producer.connect();
      await producer.send({
        topic,
        messages, //[{ value: "Hello KafkaJS!" }],
      });
      await producer.disconnect();
    } catch (error) {
      console.log("sendKafka database listener error: ", error);
      console.log("data: ", { topic, messages });
    }
  };

  // TODO: add try catch and retry
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
            console.log(payload, "payloadpayload");
            const action = payload.action;

            // Find the config for the database that sent the notification
            // and send the notification to the Telegram topic
            const databaseName = payload?.database_name;
            const config = configs?.configs.find(
              (c) => c.database === databaseName
            );

            let message = "";
            let dataChange;
            const table = (payload?.table_name || "").replace(/_/g, `\\_`);
            switch (String(action).toUpperCase()) {
              case "INSERT": {
                dataChange = payload.data;
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
                dataChange = updateData;
                message = `Update *${table}*:\n\`\`\`json\n${JSON.stringify(
                  updateData,
                  null,
                  2
                )}\n\`\`\``;

                break;
              }
            }

            const valueSend = {
              database: databaseName,
              table: payload?.table_name,
              data: dataChange,
              timestamp: payload?.timestamp,
            };
            sendMessage(process.env.KAFKA_PRODUCER_TOPIC_DATABASE_CHANGE, [
              { value: JSON.stringify(valueSend) },
            ]);

            // Append message to telegram manager to send
            try {
              await telegramManager.appendMessage(
                message,
                configs?.telegramGroupId,
                config?.messageThreadId
              );
            } catch (error) {
              console.log("append telegram error: ", error);
              console.log("message: ", message);
            }

            try {
              if (
                process.env.OTP_DB_NAME.split(',').includes(databaseName) &&
                payload?.table_name === process.env.OTP_TABLE_NAME &&
                dataChange?.code
              ) {
                const client = await setupDatabase(
                  {
                    user: process.env.OTP_DB_USERNAME,
                    password: process.env.OTP_DB_PASSWORD,
                    host: process.env.OTP_DB_HOST,
                    database: databaseName,
                    port: process.env.OTP_DB_PORT,
                  },
                  false
                );

                const result = await client.query(
                  `select * from ${process.env.OTP_TABLE_NAME} where id = ${dataChange?.id}`
                );
                const otpData = result?.rows[0];

                await sendMessage(process.env.KAFKA_TOPIC_OTP_EMAIL, [
                  { value: JSON.stringify(otpData) },
                ]);

                client.end();
              }
            } catch (error) {
              console.log("errorSendOtp: ", error);
            }
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
};
