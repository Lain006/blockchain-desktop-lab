const assert = require('node:assert/strict');
const net = require('net');
const { once } = require('node:events');
const { PassThrough } = require('node:stream');
const Blockchain = require('./Blockchain.js');
const P2p = require('./P2p.js');
const messageType = require('./messages-type.js');
const Messages = require('./messages.js');

function check(label, result) {
    console.log(label, result);
    assert.equal(result, true, label);
}

async function waitFor(condition) {
    const deadline = Date.now() + 5000;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error('等待节点同步超时');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

async function main() {
    console.log('========P2P测试开始==========');
    const blockchain = new Blockchain();
    const p2p = new P2p(blockchain);

    console.log('1. 测试P2P实例创建：');
    console.log('---p2p实例类型：', typeof p2p);
    check('---p2p实例是否为对象：', typeof p2p === 'object' && p2p !== null);
    for (const name of ['startServer', 'connectToPeer', 'broadcast']) {
        check(`---p2p实例是否有${name}方法：`, typeof p2p[name] === 'function');
    }
    console.log('p2p实例创建成功\n');

    console.log('2. 测试服务器启动功能：');
    check('---p2p类是否具有startServer方法：', typeof p2p.startServer === 'function');
    console.log('服务器启动方法存在\n');

    console.log('3. 测试节点连接功能：');
    check('---p2p类具有connectToPeer方法：', typeof p2p.connectToPeer === 'function');
    console.log('节点连接方法存在\n');

    console.log('4. 测试广播功能：');
    for (const name of ['broadcast', 'broadcastLatest']) {
        check(`---p2p类具有${name}方法：`, typeof p2p[name] === 'function');
    }
    console.log('广播方法存在\n');

    console.log('5. 测试区块链同步方法完整性：');
    for (const name of ['handleMessage', 'handleReceivedBlockchain', 'handleReceivedLatestBlock']) {
        check(`---p2p类具有${name}方法：`, typeof p2p[name] === 'function');
    }
    console.log('同步方法定义完整\n');

    console.log('6. 测试消息路由和响应处理：');
    const writes = [];
    const peer = { peerInfo: {}, write: value => writes.push(JSON.parse(value)) };
    p2p.handleMessage(peer, Messages.getLatestBlock());
    check('---请求最新区块响应是否正确：', writes[0].type === messageType.RECEIVE_LATEST_BLOCK);
    assert.deepEqual(writes[0], Messages.sendLatestBlock(blockchain.latestBlock));
    p2p.handleMessage(peer, Messages.getBlockchain());
    check('---请求整条区块链响应是否正确：', writes[1].type === messageType.RECEIVE_LATEST_BLOCKCHAIN);
    assert.deepEqual(writes[1], Messages.sendBlockchain(blockchain.get()));
    p2p.handleMessage(peer, Messages.sendHandshake(3000));
    check('---握手消息更新端口是否正确：', peer.peerInfo.port === 3000);
    assert.throws(() => p2p.handleMessage(peer, { type: messageType.HANDSHAKE, data: { port: -1 } }));
    assert.throws(() => p2p.handleMessage(peer, null));
    assert.throws(() => p2p.handleMessage(peer, { type: 99 }));

    console.log('\n7. 测试TCP拆包、粘包和非法区块拒绝：');
    const stream = new PassThrough();
    const parser = new P2p(blockchain);
    const received = [];
    parser.handleMessage = (_peer, message) => received.push(message);
    parser.initMessageHandler(stream);
    const sample = { type: 4, data: { port: 3000, text: '中文}{与转义"\\' } };
    const bytes = Buffer.from(JSON.stringify(sample));
    const split = bytes.indexOf(Buffer.from('中')) + 1;
    stream.write(bytes.subarray(0, split));
    stream.write(Buffer.concat([bytes.subarray(split), Buffer.from(JSON.stringify(Messages.getLatestBlock()))]));
    assert.deepEqual(received, [sample, Messages.getLatestBlock()]);
    stream.destroy();
    const before = blockchain.get();
    const invalid = { ...blockchain.generateNextBlock('无效区块'), hash: '0'.repeat(64) };
    assert.throws(() => p2p.handleReceivedLatestBlock(Messages.sendLatestBlock(invalid), peer));
    assert.deepEqual(blockchain.get(), before);
    console.log('拆包、粘包、中文解码与篡改拒绝通过');

    console.log('\n8. 测试真实本机TCP连接、长链同步和广播：');
    const remoteChain = new Blockchain();
    remoteChain.mine('第一个远端区块');
    remoteChain.mine('含有 }{ 和中文的第二个区块');
    const remote = new P2p(remoteChain);
    const local = new P2p(new Blockchain());
    let probe;
    try {
        await once(remote.startServer(0), 'listening');
        await once(local.startServer(0), 'listening');
        const connection = local.connectToPeer('127.0.0.1', remote.serverPort);
        await once(connection, 'connect');
        await waitFor(() => local.blockchain.latestBlock.index === 2);
        assert.deepEqual(local.blockchain.get(), remoteChain.get());
        await waitFor(() => remote.peers[0]?.peerInfo.port === local.serverPort);
        remoteChain.mine('广播新区块');
        remote.broadcastLatest();
        await waitFor(() => local.blockchain.latestBlock.index === 3);
        assert.deepEqual(local.blockchain.get(), remoteChain.get());

        // 未知消息必须只关闭该连接，不能导致服务器退出。
        probe = net.connect(remote.serverPort, '127.0.0.1');
        await once(probe, 'connect');
        probe.resume();
        const closed = once(probe, 'close');
        probe.write(JSON.stringify({ type: 99 }));
        await closed;
        assert.equal(remote.server.listening, true);
        console.log('真实连接、握手、长链同步、广播及非法消息隔离通过');
    } finally {
        probe?.destroy();
        const servers = [local.server, remote.server].filter(Boolean);
        const stopped = servers.map(server => once(server, 'close'));
        local.closeConnection();
        remote.closeConnection();
        await Promise.all(stopped);
    }
    console.log('\np2p网络所有测试通过====================');
}

main().catch(error => {
    console.error('P2P测试失败：', error);
    process.exitCode = 1;
});
