# Database Change Bot 🤖

The Database Change Bot is an innovative application designed to monitor changes in MongoDB and PostgreSQL databases and notify these changes through Telegram messages. This bot makes it easier to keep track of database modifications in real-time, enhancing monitoring and response strategies for database administrators and development teams. 🚀

## Features 🌟

- **Database Monitoring**: Listen to changes (inserts, updates, deletions) in MongoDB and PostgreSQL databases. 📈
- **Telegram Notifications**: Sends customized notifications to a Telegram group or channel to alert about the database changes. 💬
- **Configurable**: Easily configure database connections and Telegram group IDs through a simple JSON configuration. ⚙️
- **Docker Support**: Comes with Docker support for easy deployment and scalability. 🐳

## Getting Started 🏁

### Prerequisites

- Node.js 📦
- MongoDB and/or PostgreSQL 🗃️
- A Telegram bot token (create one through BotFather in Telegram) 🤖

### Installation

1. Clone the repository:  
```bash
git clone https://github.com/dongtranthien/database-change-bot.git
```

2. Install the dependencies:  
```bash
cd database-change-bot
npm install
```

3. Copy the `.env.sample` and `config.json.sample` files to `.env` and `config.json` respectively and update them with your actual configuration details.

4. Start the bot:  
```
node app.js
```

### Docker Deployment 🐳

Build and run the Docker container using:  
```
docker build -t database-change-bot .
docker run -d --name database-change-bot --env-file .env database-change-bot
```

### Configuration ⚙️

Edit `config.json` to include your database connection details and Telegram group ID. Refer to `config.json.sample` for the sample configuration.

### Environment Variables

- `TELEGRAM_GROUP_ID`: Your Telegram group or channel ID where notifications will be sent. 📨

## Usage 📘

Once the bot is running, it will start monitoring the specified databases for changes and send notifications to the configured Telegram group or channel.

## Contributing 🤝

Contributions are welcome! Please feel free to submit a pull request.

## License 📄

This project is licensed under the MIT License - see the LICENSE.md file for details.
