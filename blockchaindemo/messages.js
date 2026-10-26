const messageType = require("./messages-type");
const Block = require("./Block");
const {
  REQUEST_LATEST_BLOCK,
  RECEIVE_LATEST_BLOCK,
  REQUEST_LATEST_BLOCKCHAIN,
  RECEIVE_LATEST_BLOCKCHAIN,
  HANDSHAKE,
} = messageType;

class Messages {
  // 请求最新区块。
  static getLatestBlock() {
    return { type: REQUEST_LATEST_BLOCK };
  }

  // 将最新区块发送给请求方。
  static sendLatestBlock(block) {
    if (!Block.isValidStructure(block)) {
      throw new TypeError("响应区块结构无效");
    }
    return { type: RECEIVE_LATEST_BLOCK, data: { ...block } };
  }

  // 请求整个区块链。
  static getBlockchain() {
    return { type: REQUEST_LATEST_BLOCKCHAIN };
  }

  // 将整个区块链发送给请求方。
  static sendBlockchain(blockchain) {
    if (!Array.isArray(blockchain)) {
      throw new TypeError("响应区块链必须为数组");
    }
    // Array.from 会显式访问稀疏项，避免 map/every 跳过空位导致漏检。
    const blocks = Array.from(blockchain, (block) => Messages.sendLatestBlock(block).data);
    return { type: RECEIVE_LATEST_BLOCKCHAIN, data: blocks };
  }

  // 握手消息包含本节点的监听端口。
  static sendHandshake(port) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new TypeError("端口必须为 1 至 65535 的整数");
    }
    return { type: HANDSHAKE, data: { port } };
  }
}

module.exports = Messages;
