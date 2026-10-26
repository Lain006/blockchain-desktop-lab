const crypto = require("node:crypto");

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const BLOCK_FIELDS = ["index", "previousHash", "timestamp", "data", "hash", "nonce"];

// 定义区块的数据结构。
class Block {
  constructor(index, previousHash, timestamp, data, hash, nonce) {
    this.index = index; // 区块的索引
    this.previousHash = previousHash; // 前一个区块的哈希值
    this.timestamp = timestamp; // 区块的时间戳
    this.data = data; // 区块的数据
    this.hash = hash; // 当前区块的哈希值
    this.nonce = nonce; // 挖矿时使用的尝试计数
  }

  static isValidHash(hash) {
    return typeof hash === "string" && hash.length === 64 && HASH_PATTERN.test(hash);
  }

  static isValidHeader(index, previousHash, timestamp, data, nonce) {
    return Number.isSafeInteger(index) && index >= 0
      && typeof previousHash === "string"
      && (index === 0 ? previousHash === "0" : Block.isValidHash(previousHash))
      && Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= 8640000000000000
      && typeof data === "string"
      && Number.isSafeInteger(nonce) && nonce >= 0;
  }

  // 对 JSON 区块先校验字段，避免循环对象或隐式类型转换进入哈希计算。
  static isValidStructure(block) {
    return block !== null && typeof block === "object" && !Array.isArray(block)
      && Object.keys(block).length === BLOCK_FIELDS.length
      && BLOCK_FIELDS.every((field) => Object.hasOwn(block, field))
      && Block.isValidHeader(block.index, block.previousHash, block.timestamp, block.data, block.nonce)
      && Block.isValidHash(block.hash);
  }

  static calculateHash(index, previousHash, timestamp, data, nonce) {
    if (!Block.isValidHeader(index, previousHash, timestamp, data, nonce)) {
      throw new TypeError("区块字段无效：索引、时间戳和nonce须为非负安全整数，数据须为字符串，前块哈希须符合格式");
    }
    // 固定顺序的数组保留字段边界，避免直接拼接导致不同字段得到相同字节串。
    return crypto.createHash("sha256")
      .update(JSON.stringify([index, previousHash, timestamp, data, nonce]), "utf8")
      .digest("hex");
  }

  // 固定创世区块，nonce 与哈希通过相同编码和难度重新计算。
  static get genesis() {
    return new Block(
      0,
      "0",
      1508270000000,
      "Genesis Block",
      "000f84fcab79cd05f322f8402f50ea43b0fe79e2cc38aae1c5b012efd37bd274",
      13811,
    );
  }
}

module.exports = Block;
