const { MongoClient } = require("mongodb");

let client;

exports.initMongo = async () => {
  const uri = process.env.MONGO_LOG_URL;
  client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  await client.connect();
};

exports.insertMongo = async (collectionName, content) => {
  try {
    const dbName = process.env.MONGO_DB_NAME;
    const database = client.db(dbName);

    const collection = database.collection(collectionName);

    await collection.insertOne(content);

    console.log("Log đã được ghi vào MongoDB.");
  } catch (error) {
    console.error("Ghi log vào MongoDB thất bại:", error);
  } finally {
    //await client.close();
  }
};
