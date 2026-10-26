const Block = require("./Block");

class Blockchain {
  #blockchain = [{ ...Block.genesis }];
  #storage;
  #onChange;

  constructor({ storage, onChange = () => {} } = {}) {
    this.#storage = storage;
    this.#onChange = onChange;
    if (storage) {
      const saved = storage.load();
      if (saved !== null) {
        if (!this.isValidChain(saved)) throw new Error('保存的区块链无效');
        this.#blockchain = saved.map((block) => ({ ...block }));
      } else storage.save(this.get());
    }
  }

  #commit(chain, kind) {
    const snapshot = chain.map((block) => ({ ...block }));
    this.#storage?.save(snapshot);
    this.#blockchain = snapshot;
    this.#onChange({ kind, block: this.latestBlock, blockCount: snapshot.length, saved: Boolean(this.#storage) });
  }

  get difficulty() {
    return 3; // 本课程链的固定共识参数，调用方不能随意降低难度。
  }

  // 兼容课程中的属性读取，但不暴露内部数组。
  get blockchain() {
    return this.get();
  }

  get() {
    return this.#blockchain.map((block) => ({ ...block }));
  }

  get latestBlock() {
    return { ...this.#blockchain[this.#blockchain.length - 1] };
  }

  isValidHashDifficulty(hash) {
    return Block.isValidHash(hash)
      && hash.startsWith("0".repeat(this.difficulty));
  }

  calculateHashForBlock(block) {
    if (!Block.isValidStructure(block)) {
      throw new TypeError("区块结构无效");
    }
    const { index, previousHash, timestamp, data, nonce } = block;
    return this.calculateHash(index, previousHash, timestamp, data, nonce);
  }

  calculateHash(index, previousHash, timestamp, data, nonce) {
    return Block.calculateHash(index, previousHash, timestamp, data, nonce);
  }

  mine(data) {
    const newBlock = this.generateNextBlock(data);
    // 添加失败时向调用方抛错，避免把未加入链的区块当作挖矿成功。
    this.addBlock(newBlock);
    return this.latestBlock;
  }

  generateNextBlock(data) {
    if (typeof data !== "string") {
      throw new TypeError("区块数据必须为字符串");
    }
    const previousBlock = this.latestBlock;
    const nextIndex = previousBlock.index + 1;
    const previousHash = previousBlock.hash;
    // 挖矿期间时间戳固定，且不会早于前一个区块。
    const timestamp = Math.max(Date.now(), previousBlock.timestamp);
    let nonce = 0;
    let nextHash = this.calculateHash(
      nextIndex, previousHash, timestamp, data, nonce,
    );

    while (!this.isValidHashDifficulty(nextHash)) {
      nonce++;
      nextHash = this.calculateHash(
        nextIndex, previousHash, timestamp, data, nonce,
      );
    }

    return new Block(nextIndex, previousHash, timestamp, data, nextHash, nonce);
  }

  addBlock(newBlock) {
    if (this.isValidNextBlock(newBlock, this.latestBlock)) {
      // 数据为字符串，复制字段即可断开调用方的引用。
      this.#commit([...this.#blockchain, { ...newBlock }], 'append');
    } else {
      throw new Error("区块无效：字段、链接、哈希、时间戳或挖矿难度不符合要求");
    }
  }

  isValidNextBlock(newBlock, previousBlock) {
    if (!Block.isValidStructure(newBlock) || !Block.isValidStructure(previousBlock)) {
      return false;
    }
    return previousBlock.index + 1 === newBlock.index
      && previousBlock.hash === newBlock.previousHash
      && newBlock.timestamp >= previousBlock.timestamp
      && this.isValidHashDifficulty(newBlock.hash)
      && this.calculateHashForBlock(newBlock) === newBlock.hash;
  }

  isValidChain(chain) {
    if (!Array.isArray(chain) || chain.length === 0 || !Block.isValidStructure(chain[0])) {
      return false;
    }
    const genesis = Block.genesis;
    if (!Object.keys(genesis).every((field) => chain[0][field] === genesis[field])
      || this.calculateHashForBlock(chain[0]) !== chain[0].hash
      || !this.isValidHashDifficulty(chain[0].hash)) {
      return false;
    }
    for (let i = 1; i < chain.length; i++) {
      if (!this.isValidNextBlock(chain[i], chain[i - 1])) {
        return false;
      }
    }
    return true;
  }

  isChainLonger(chain) {
    return Array.isArray(chain) && chain.length > this.#blockchain.length;
  }

  replaceChain(newChain) {
    if (this.isValidChain(newChain) && this.isChainLonger(newChain)) {
      this.#commit(newChain, 'replace');
    } else {
      throw new Error("不能用无效、等长或更短的链来替换当前链");
    }
  }
}

module.exports = Blockchain;
