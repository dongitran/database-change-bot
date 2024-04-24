const { insertMongo } = require("./logger");
const { sleep } = require("./sleep");
const { Mutex } = require('async-mutex');

require("dotenv").config();

class TelegramManager {
  constructor(bot) {
    this.bot = bot;

    this.messageId = null;
    this.messageCurrent = [];
    this.timeCheckSendMessage = new Date().getTime();
    this.processing = false;
    this.isAppendMessageProcessing = false;
    this.isSendOneMessageProcessing = false;
    
    // Khởi tạo mutex để lock biến messageCurrent
    this.messageMutex = new Mutex();
  }

  async appendMessage(message, chatId, messageThreadId) {
    let retry = 0;
    while (this.isSendOneMessageProcessing && retry < 10) {
      retry++;
      await sleep(1000);
    }

    // Lock biến messageCurrent
    const release = await this.messageMutex.acquire();
    try {
      this.isAppendMessageProcessing = true;
      let hasSameMessage = false;
      this.messageCurrent = this.messageCurrent
        .reverse()
        .map((messageObj) => {
          if (
            !hasSameMessage &&
            messageObj.chatId === chatId &&
            ((!messageObj.messageThreadId && !messageThreadId) ||
              messageObj.messageThreadId === messageThreadId) &&
            (messageObj.message + message).length < 3800
          ) {
            hasSameMessage = true;
            return {
              ...messageObj,
              message: messageObj.message + message,
            };
          } else return messageObj;
        })
        .reverse();

      if (!hasSameMessage) {
        this.messageCurrent.push({
          chatId,
          messageThreadId,
          message,
        });
      }

      await insertMongo("telegram_manager_log", {
        createdAt: new Date(),
        type: "append-message",
        message,
        chatId,
        messageThreadId,
        messageCurrent: this.messageCurrent,
      });
    } finally {
      // Unlock biến messageCurrent
      release();
      this.isAppendMessageProcessing = false;
    }
  }

  async sendOneMessage(checkTime) {
    let retry = 0;
    while (this.isAppendMessageProcessing && retry < 10) {
      retry++;
      await sleep(1000);
    }

    // Lock biến messageCurrent
    const release = await this.messageMutex.acquire();
    try {
      this.isSendOneMessageProcessing = true;

      // Check if processing
      if (this.processing) return;
      // Check if message is empty to return
      if (this.messageCurrent.length === 0) return;
      const logContent = [
        {
          createdAt: new Date(),
          type: "send-message",
          status: "before3",
          messageCurrent: [...this.messageCurrent],
        },
      ];

      // Check time to prevent send multiple request in times
      if (checkTime) {
        const now = new Date().getTime();
        if (now - this.timeCheckSendMessage < 1000) {
          return;
        }
        this.timeCheckSendMessage = now;
      }

      // Set the processing
      this.processing = true;

      try {
        // Get the first message
        const messageObj = this.messageCurrent[0];
        let messageSend = messageObj.message;

        logContent.push({
          createdAt: new Date(),
          type: "send-message",
          status: "before2",
          messageSend,
          messageCurrent: [...this.messageCurrent],
        });
        // Check if message is too long to split message into multiple message
        if (messageObj.message.length > 4090) {
          if (messageObj?.isCountinue) {
            messageSend =
              "```json" + messageObj.message.substring(0, 4090) + "```";
          } else {
            messageSend = messageObj.message.substring(0, 4090) + "```";
          }
        } else {
          if (messageObj?.isCountinue) {
            messageSend = "```json" + messageObj.message;
          }
        }
        logContent.push({
          createdAt: new Date(),
          type: "send-message",
          status: "before1",
          messageSend,
          messageCurrent: [...this.messageCurrent],
        });

        const t = await this.bot.telegram.sendMessage(
          messageObj.chatId,
          messageSend,
          {
            // parse_mode: "HTML",
            parse_mode: "MarkdownV2",
            ...(messageObj.messageThreadId && {
              message_thread_id: messageObj.messageThreadId,
            }),
          }
        );

        // Update message current if message is too long
        // or remove the first message
        logContent.push({
          createdAt: new Date(),
          type: "send-message",
          status: "before",
          messageSend,
          messageCurrent: [...this.messageCurrent],
        });

        if (messageObj.message.length > 4090) {
          messageObj.message = messageObj.message.substring(4090);
          messageObj.isCountinue = true;
        } else {
          // Remove the first message
          this.messageCurrent.shift();
        }

        await insertMongo("telegram_manager_log", {
          createdAt: new Date(),
          type: "send-message",
          status: "after",
          messageSend,
          messageCurrent: this.messageCurrent,
          array: logContent,
        });

        // Clear the processing
        this.processing = false;

        return t;
      } catch (error) {
        // Clear the processing
        this.processing = false;

        console.log("send message current error: ", error);
      }
    } finally {
      // Unlock biến messageCurrent
      release();
      this.isSendOneMessageProcessing = false;
    }
  }
}

module.exports = TelegramManager;
