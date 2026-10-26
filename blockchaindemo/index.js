const Block = require("./Block");
const Blockchain = require("./Blockchain");
const Messages = require("./messages");
const messageType = require("./messages-type");

// 作为模块引入时不运行演示，也不改变调用方的区块链。
module.exports = { Block, Blockchain, Messages, messageType };

if (require.main === module) {
  require("./cli")();
}
