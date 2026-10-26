const assert = require("node:assert/strict");
const messageType = require("./messages-type");
const Messages = require("./messages");
const Block = require("./Block");

console.log("==========消息类型和消息工厂测试开始==========");

try {
  console.log("测试1：测试消息的枚举类型");
  assert.deepEqual(messageType, {
    REQUEST_LATEST_BLOCK: 0,
    RECEIVE_LATEST_BLOCK: 1,
    REQUEST_LATEST_BLOCKCHAIN: 2,
    RECEIVE_LATEST_BLOCKCHAIN: 3,
    HANDSHAKE: 4,
  });
  for (const [name, value] of Object.entries(messageType)) {
    console.log(`${name}：`, value);
  }

  console.log("测试2：测试请求最新区块消息功能");
  const requestLatestBlockMsg = Messages.getLatestBlock();
  assert.deepEqual(requestLatestBlockMsg, { type: messageType.REQUEST_LATEST_BLOCK });
  console.log("是否为请求最新区块类型：", requestLatestBlockMsg.type === messageType.REQUEST_LATEST_BLOCK);
  console.log("消息结构：", JSON.stringify(requestLatestBlockMsg));

  console.log("测试3：测试响应最新区块消息功能");
  const testBlock = Block.genesis;
  const sendLatestBlockMsg = Messages.sendLatestBlock(testBlock);
  assert.deepEqual(sendLatestBlockMsg, {
    type: messageType.RECEIVE_LATEST_BLOCK,
    data: { ...testBlock },
  });
  assert.equal(sendLatestBlockMsg.data.index, 0);
  console.log("是否为响应最新区块类型：", sendLatestBlockMsg.type === messageType.RECEIVE_LATEST_BLOCK);
  console.log("包含的响应区块数据：", sendLatestBlockMsg.data);
  console.log("消息结构：", JSON.stringify(sendLatestBlockMsg));

  console.log("测试4：测试请求整个区块链消息功能");
  const requestBlockchainMsg = Messages.getBlockchain();
  assert.deepEqual(requestBlockchainMsg, { type: messageType.REQUEST_LATEST_BLOCKCHAIN });
  console.log("是否为请求整个区块链类型：", requestBlockchainMsg.type === messageType.REQUEST_LATEST_BLOCKCHAIN);
  console.log("消息结构：", JSON.stringify(requestBlockchainMsg));

  console.log("测试5：测试响应整个区块链消息功能");
  const testChain = [Block.genesis];
  const sendBlockchainMsg = Messages.sendBlockchain(testChain);
  assert.deepEqual(sendBlockchainMsg, {
    type: messageType.RECEIVE_LATEST_BLOCKCHAIN,
    data: testChain.map((block) => ({ ...block })),
  });
  assert.equal(sendBlockchainMsg.data.length, 1);
  assert.equal(sendBlockchainMsg.data[0].index, 0);
  console.log("是否为响应整个区块链类型：", sendBlockchainMsg.type === messageType.RECEIVE_LATEST_BLOCKCHAIN);
  console.log("包含响应的区块链数据长度：", sendBlockchainMsg.data.length);
  console.log("消息结构：", JSON.stringify(sendBlockchainMsg));

  console.log("测试6：测试发送握手消息功能");
  const handshakeMsg = Messages.sendHandshake(2727);
  assert.deepEqual(handshakeMsg, { type: messageType.HANDSHAKE, data: { port: 2727 } });
  console.log("是否为握手消息类型：", handshakeMsg.type === messageType.HANDSHAKE);
  console.log("握手端口数据：", handshakeMsg.data.port);
  console.log("握手端口数据是否为2727：", handshakeMsg.data.port === 2727);
  console.log("消息结构：", JSON.stringify(handshakeMsg));

  console.log("测试7：测试消息类型完整性和序列化");
  const allMessagesTypes = Object.keys(messageType);
  assert.equal(allMessagesTypes.length, 5);
  assert.equal(new Set(Object.values(messageType)).size, 5);
  // 模拟网络传输的 JSON 往返，确认消息字段和区块数据不会丢失。
  for (const message of [
    requestLatestBlockMsg, sendLatestBlockMsg, requestBlockchainMsg,
    sendBlockchainMsg, handshakeMsg,
  ]) {
    const received = JSON.parse(JSON.stringify(message));
    assert.equal(received.type, message.type);
    assert.equal(JSON.stringify(received), JSON.stringify(message));
  }
  assert.deepEqual(Messages.sendBlockchain([]), {
    type: messageType.RECEIVE_LATEST_BLOCKCHAIN, data: [],
  });
  console.log("定义的消息类型数量：", allMessagesTypes.length);
  console.log("消息类型列表：", allMessagesTypes.join(","));
  console.log("==========所有消息类型测试通过==========");
} catch (error) {
  console.error("测试过程中发生错误：", error);
  process.exitCode = 1;
}
