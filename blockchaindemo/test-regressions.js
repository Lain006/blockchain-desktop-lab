const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Block = require("./Block");
const Blockchain = require("./Blockchain");
const Messages = require("./messages");
const messageType = require("./messages-type");

test("创世区块的哈希和工作量证明均可重新验证", () => {
  const chain = new Blockchain();
  const genesis = Block.genesis;
  assert.equal(chain.calculateHashForBlock(genesis), genesis.hash);
  assert.equal(chain.isValidHashDifficulty(genesis.hash), true);
});

test("字段编码消除相邻字段拼接歧义", () => {
  const chain = new Blockchain();
  const first = chain.calculateHash(0, "0", 12, "3", 4);
  const second = chain.calculateHash(0, "0", 1, "23", 4);
  assert.notEqual(first, second);
  // 固定字节串作为独立预期值，避免只比较实现自身。
  const expected = crypto.createHash("sha256").update('[0,"0",12,"3",4]').digest("hex");
  assert.equal(first, expected);
});

test("难度校验拒绝非 SHA-256 字符串和非法类型", () => {
  const chain = new Blockchain();
  for (const hash of [null, undefined, 123, {}, [], "000", "000bad!", "0".repeat(65), "0".repeat(64) + "\n"]) {
    assert.equal(chain.isValidHashDifficulty(hash), false);
  }
  assert.equal(chain.isValidHashDifficulty("000" + "a".repeat(61)), true);
});

test("创世区块验证不依赖对象属性插入顺序", () => {
  const genesis = Object.fromEntries(Object.entries(Block.genesis).reverse());
  assert.equal(new Blockchain().isValidChain([genesis]), true);
});

test("无效链、畸形区块和稀疏数组返回 false", () => {
  const chain = new Blockchain();
  const cycle = {};
  cycle.data = cycle;
  for (const candidate of [null, {}, [], [null], [cycle], [Block.genesis, null], new Array(2)]) {
    assert.equal(chain.isValidChain(candidate), false);
  }
  const next = chain.generateNextBlock("校验测试");
  for (const change of [
    { index: "1" }, { index: NaN }, { nonce: -1 }, { nonce: 0.5 },
    { timestamp: -1 }, { timestamp: Number.MAX_SAFE_INTEGER }, { timestamp: Infinity },
    { timestamp: Block.genesis.timestamp - 1 }, { data: {} },
    { hash: null }, { previousHash: 0 }, { extra: "不属于区块协议" },
  ]) {
    assert.equal(chain.isValidNextBlock({ ...next, ...change }, Block.genesis), false);
  }
  assert.equal(chain.isChainLonger(null), false);
  assert.equal(chain.isChainLonger({ length: 99 }), false);
});

test("对象、缺失或其他非字符串数据无法挖矿或计算哈希", () => {
  const chain = new Blockchain();
  for (const data of [undefined, null, {}, [], 123, true, 1n]) {
    assert.throws(() => chain.mine(data), TypeError);
    assert.throws(() => chain.calculateHash(0, "0", 1, data, 0), TypeError);
  }
  assert.equal(chain.get().length, 1);
});

test("读取链、最新块或兼容属性后修改，不会污染内部状态", () => {
  const chain = new Blockchain();
  const snapshot = chain.get();
  snapshot[0].data = "外部篡改";
  snapshot.length = 0;
  chain.latestBlock.hash = "坏哈希";
  chain.blockchain.length = 0;
  assert.equal(chain.get().length, 1);
  assert.equal(chain.latestBlock.data, "Genesis Block");
  assert.equal(chain.isValidChain(chain.get()), true);
});

test("外部修改难度不会绕过共识或导致挖矿无限循环", () => {
  const chain = new Blockchain();
  Reflect.set(chain, "difficulty", -1);
  assert.equal(chain.difficulty, 3);
  Reflect.set(chain, "difficulty", 100);
  assert.equal(chain.difficulty, 3);
});

test("加入区块后调用方修改原对象不会污染链", () => {
  const chain = new Blockchain();
  const block = chain.generateNextBlock("原始数据");
  chain.addBlock(block);
  block.data = "外部篡改";
  assert.equal(chain.latestBlock.data, "原始数据");
  assert.equal(chain.isValidChain(chain.get()), true);
});

test("JSON 往返后的有效长链可替换，后续仍可挖矿", () => {
  const sender = new Blockchain();
  sender.mine("节点甲");
  const receiver = new Blockchain();
  const candidate = JSON.parse(JSON.stringify(sender.get()));
  receiver.replaceChain(candidate);
  candidate[1].data = "外部篡改";
  receiver.mine("节点乙");
  assert.equal(receiver.get().length, 3);
  assert.equal(receiver.isValidChain(receiver.get()), true);
  const before = receiver.get();
  for (const invalid of [null, [], before, sender.get()]) {
    assert.throws(() => receiver.replaceChain(invalid));
    assert.deepEqual(receiver.get(), before);
  }
});

test("握手端口必须是 1 至 65535 的整数", () => {
  for (const port of [-1, 0, 65536, 1.5, NaN, Infinity, "2727", null, undefined]) {
    assert.throws(() => Messages.sendHandshake(port), /端口/);
  }
  assert.equal(Messages.sendHandshake(1).data.port, 1);
  assert.equal(Messages.sendHandshake(65535).data.port, 65535);
});

test("响应消息拒绝缺失或畸形区块数据", () => {
  for (const block of [null, undefined, {}, { ...Block.genesis, data: {} }]) {
    assert.throws(() => Messages.sendLatestBlock(block), TypeError);
  }
  for (const chain of [null, undefined, {}, [null], new Array(1)]) {
    assert.throws(() => Messages.sendBlockchain(chain), TypeError);
  }
});

test("响应消息保存数据快照，原数据变化不影响待发送消息", () => {
  const block = Block.genesis;
  const latest = Messages.sendLatestBlock(block);
  const blocks = [block];
  const all = Messages.sendBlockchain(blocks);
  block.data = "外部篡改";
  blocks.length = 0;
  assert.equal(latest.data.data, "Genesis Block");
  assert.equal(all.data.length, 1);
  assert.equal(all.data[0].data, "Genesis Block");
});

test("消息枚举不可被调用方改写", () => {
  const original = messageType.HANDSHAKE;
  Reflect.set(messageType, "HANDSHAKE", 99);
  assert.equal(messageType.HANDSHAKE, original);
  assert.equal(Messages.sendHandshake(2727).type, messageType.HANDSHAKE);
});

test("系统时间回退时仍能生成有效的后继区块", () => {
  const originalNow = Date.now;
  try {
    Date.now = () => 0;
    const chain = new Blockchain();
    const block = chain.mine("");
    assert.equal(block.timestamp, Block.genesis.timestamp);
    assert.equal(block.data, "");
    assert.equal(chain.isValidChain(chain.get()), true);
  } finally {
    Date.now = originalNow;
  }
});

test("包入口可以导入，并为不同实例维护独立状态", () => {
  const api = require("./index");
  assert.equal(api.Blockchain, Blockchain);
  assert.equal(api.Block, Block);
  assert.equal(api.Messages, Messages);
  assert.equal(api.messageType, messageType);
  const first = new api.Blockchain();
  const second = new api.Blockchain();
  first.mine("只属于第一条链");
  assert.equal(second.get().length, 1);
  assert.equal(second.isValidChain(second.get()), true);
});
