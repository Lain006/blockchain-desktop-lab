const messageType = Object.freeze({
  REQUEST_LATEST_BLOCK: 0, // 请求最新区块
  RECEIVE_LATEST_BLOCK: 1, // 响应最新区块
  REQUEST_LATEST_BLOCKCHAIN: 2, // 请求整个区块链
  RECEIVE_LATEST_BLOCKCHAIN: 3, // 响应整个区块链
  HANDSHAKE: 4, // 握手消息，交换节点的监听端口
});

module.exports = messageType;
