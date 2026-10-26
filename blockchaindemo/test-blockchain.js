const assert = require("node:assert/strict");
const Block = require("./Block");
const Blockchain = require("./Blockchain");

console.log("==========区块链测试开始==========");

try {
  const genesis = Block.genesis;
  assert.ok(genesis instanceof Block);
  assert.deepEqual(genesis, new Block(
    0,
    "0",
    1508270000000,
    "Genesis Block",
    "000f84fcab79cd05f322f8402f50ea43b0fe79e2cc38aae1c5b012efd37bd274",
    13811,
  ));
  console.log("区块索引：", genesis.index);
  console.log("前一个区块哈希值：", genesis.previousHash);
  console.log("时间戳：", genesis.timestamp);
  console.log("数据：", genesis.data);
  console.log("哈希值：", genesis.hash);
  console.log("nonce值：", genesis.nonce);
  console.log("==========区块数据结构测试通过==========");

  console.log("2：测试区块链初始化");
  const blockchain = new Blockchain();
  assert.equal(blockchain.get().length, 1);
  assert.equal(blockchain.latestBlock.index, 0);
  assert.equal(blockchain.difficulty, 3);
  console.log("区块链长度：", blockchain.get().length);
  console.log("最新区块索引：", blockchain.latestBlock.index);
  console.log("挖矿难度：", blockchain.difficulty);

  console.log("3：测试哈希难度验证");
  const validHash = "000" + "a".repeat(61);
  const invalidHash = "001" + "a".repeat(61);
  assert.equal(blockchain.isValidHashDifficulty(validHash), true);
  assert.equal(blockchain.isValidHashDifficulty(invalidHash), false);
  assert.equal(blockchain.isValidHashDifficulty(""), false);
  console.log(validHash, "是否有效：", blockchain.isValidHashDifficulty(validHash));
  console.log(invalidHash, "是否有效：", blockchain.isValidHashDifficulty(invalidHash));

  console.log("4：测试哈希计算");
  const testHash = blockchain.calculateHash(0, "0", 1234567890, "测试", 0);
  assert.equal(testHash, "d62037f04e3fbb2685e8bc6a49dc189b5240d42119b140f0880495f588c3ff81");
  assert.equal(testHash.length, 64);
  console.log("计算的哈希值：", testHash);
  console.log("哈希长度：", testHash.length, "字符");

  // 实际挖出两个区块，验证它们的数据、前块链接和工作量证明。
  for (const [index, data] of ["第一个测试区块", "第二个测试区块"].entries()) {
    console.log(`${index + 5}：测试挖${index === 0 ? "第一个" : "第二个"}区块`);
    const previousHash = blockchain.latestBlock.hash;
    blockchain.mine(data);
    const block = blockchain.latestBlock;
    assert.equal(block.index, index + 1);
    assert.equal(block.previousHash, previousHash);
    assert.equal(block.data, data);
    assert.equal(block.hash, blockchain.calculateHashForBlock(block));
    assert.ok(block.hash.startsWith("000"));
    assert.ok(Number.isInteger(block.nonce) && block.nonce >= 0);
    assert.equal(blockchain.get().length, index + 2);
    console.log("挖矿后的索引：", block.index);
    console.log("挖矿后的数据：", block.data);
    console.log("挖矿后的哈希值：", block.hash);
    console.log("挖矿后的nonce值：", block.nonce);
    console.log("当前区块链的长度：", blockchain.get().length);
  }

  console.log("7：测试区块链验证");
  const isValid = blockchain.isValidChain(blockchain.get());
  assert.equal(isValid, true);
  console.log("区块链是否有效：", isValid);

  console.log("8：显示完整的区块链");
  blockchain.get().forEach((block, index) => {
    console.log(`区块${index}`);
    console.log(` - 索引：${block.index}`);
    console.log(` - 前一个区块哈希值：${block.previousHash}`);
    console.log(` - 数据：${block.data}`);
    console.log(` - 哈希值：${block.hash}`);
    console.log(` - nonce值：${block.nonce}`);
    console.log(` - 时间戳：${block.timestamp}`);
    console.log(` - 真实时间：${new Date(block.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
    console.log("--------------------");
  });

  console.log("9：测试单个区块验证");
  const block1 = blockchain.get()[1];
  const block0 = blockchain.get()[0];
  assert.equal(blockchain.isValidNextBlock(block1, block0), true);
  console.log("区块1相对于区块0是否有效：", true);

  console.log("10：测试篡改和无效输入被拒绝");
  for (const change of [
    { index: 99 },
    { previousHash: "错误的前块哈希" },
    { data: "被篡改的数据" },
    { hash: "000伪造哈希" },
  ]) {
    assert.equal(blockchain.isValidNextBlock({ ...block1, ...change }, block0), false);
  }
  // 哈希正确但不满足挖矿难度的区块，同样不能加入链。
  const unminedBlock = { ...block1, nonce: 0 };
  do {
    unminedBlock.nonce++;
    unminedBlock.hash = blockchain.calculateHashForBlock(unminedBlock);
  } while (blockchain.isValidHashDifficulty(unminedBlock.hash));
  assert.equal(blockchain.isValidNextBlock(unminedBlock, block0), false);
  const tamperedChain = JSON.parse(JSON.stringify(blockchain.get()));
  tamperedChain[1].data = "篡改整链中的数据";
  assert.equal(blockchain.isValidChain(tamperedChain), false);
  const wrongGenesis = JSON.parse(JSON.stringify(blockchain.get()));
  wrongGenesis[0].data = "错误的创世区块";
  assert.equal(blockchain.isValidChain(wrongGenesis), false);
  assert.equal(blockchain.isValidChain([]), false);
  assert.equal(blockchain.isValidChain(null), false);
  assert.equal(blockchain.isValidChain([Block.genesis, null]), false);
  const lengthBeforeRejection = blockchain.get().length;
  assert.throws(() => blockchain.addBlock({ ...block1, index: 99 }), /区块无效/);
  assert.equal(blockchain.get().length, lengthBeforeRejection);
  console.log("篡改、难度不足、空链和无效区块拒绝测试通过");

  console.log("11：测试只接受更长的有效链");
  const receiver = new Blockchain();
  assert.equal(receiver.isChainLonger(blockchain.get()), true);
  assert.throws(() => receiver.replaceChain(tamperedChain), /不能用/);
  assert.equal(receiver.get().length, 1);
  const candidateChain = JSON.parse(JSON.stringify(blockchain.get()));
  receiver.replaceChain(candidateChain);
  assert.deepEqual(receiver.get(), candidateChain);
  candidateChain[1].data = "替换后修改外部数组";
  assert.equal(receiver.get()[1].data, "第一个测试区块");
  assert.throws(() => receiver.replaceChain(blockchain.get()), /不能用/);
  assert.throws(() => receiver.replaceChain([Block.genesis]), /不能用/);
  assert.equal(receiver.isValidChain(receiver.get()), true);
  console.log("有效长链替换、等长/短链拒绝及深拷贝测试通过");
  console.log("==========区块链全部测试通过==========");
} catch (error) {
  console.error("测试过程中发生错误：", error);
  process.exitCode = 1;
}
