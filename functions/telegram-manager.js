require("dotenv").config();

class TelegramManager {
  constructor(bot) {
    this.bot = bot;

    this.messageId = null;
    this.messageCurrent = [];
    this.timeCheckSendMessage = new Date().getTime();
  }

  async appendMessage(message, chatId, messageThreadId) {
    let hasSameMessage = false;
    this.messageCurrent = this.messageCurrent.reverse().map((messageObj) => {
      if (
        !hasSameMessage &&
        messageObj.chatId === chatId &&
        messageObj.messageThreadId === messageThreadId && 
        (messageObj.message + message).length < 4096
      ) {
        hasSameMessage = true;
        return {
          ...messageObj,
          message: messageObj.message + message,
        };
      } else return messageObj;
    }).reverse();

    if (!hasSameMessage) {
      this.messageCurrent.push({
        chatId,
        messageThreadId,
        message,
      });
    }
  }

  async sendOneMessage(checkTime) {
    // Check if message is empty to return
    if (this.messageCurrent.length === 0) return;

    // Check time to prevent send multiple request in times
    if (checkTime) {
      const now = new Date().getTime();
      if (now - this.timeCheckSendMessage < 1000) {
        return;
      }
      this.timeCheckSendMessage = now;
    }

    // Get the first message
    const messageObj = this.messageCurrent[0];
    try {
      const t = await this.bot.telegram.sendMessage(
        messageObj.chatId,
        messageObj.message,
        {
          // parse_mode: "HTML",
          parse_mode: "MarkdownV2",
          message_thread_id: messageObj.messageThreadId,
        }
      );

      // Remove the first message
      this.messageCurrent.shift();

      return t;
    } catch (error) {
      console.log("send message current error: ", error);
    }
  }
}

module.exports = TelegramManager;
