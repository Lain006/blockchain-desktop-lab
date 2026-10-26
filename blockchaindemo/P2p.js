const net = require('net'); // 引入node.js的网络模块，用于创建tcp连接
const messageType = require('./messages-type.js'); // 引入消息类型
const Messages = require('./messages.js'); // 引入消息模块
const {
    REQUEST_LATEST_BLOCK,
    RECEIVE_LATEST_BLOCK,
    REQUEST_LATEST_BLOCKCHAIN,
    RECEIVE_LATEST_BLOCKCHAIN,
    HANDSHAKE
} = messageType;

class PeerToPeer {
    //构造函数，初始化P2P网络
    constructor(blockchain) {
        this.peers = []; // 存储已连接的节点
        this.blockchain = blockchain; // 引用区块链实例
        this.serverPort = null; // 存储本节点的监听端口
        this.server = null;
    }
    // 启动服务器监听指定端口
    startServer(port, host = '127.0.0.1') {
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
            throw new TypeError('监听端口必须为 0 至 65535 的整数');
        }
        if (this.server) throw new Error('服务器已启动');
        this.server = net.createServer((socket) => {
            this.initConnection(socket); // 初始化新连接
        });
        this.server.on('error', (err) => {
            console.error(`服务器错误：${err.message}`);
        });
        this.server.listen(port, host, () => {
            this.serverPort = this.server.address().port;
            console.log(`服务器已启动：${host}:${this.serverPort}`);
        });
        return this.server;
    }
    // 发现对等节点功能（当前版本未实现）
    discoverPeers() {
        // 发现对等节点功能已移除，需要手动连接节点
        console.log("发现对等节点功能需要手动实现，请使用 'connect' 命令连接其他节点");
    }
    // 连接到指定的对等节点
    connectToPeer(host, port) {
        Messages.sendHandshake(port); // 复用现有端口校验。
        const socket = net.connect(port, host, () => {
            console.log(`已连接节点：${host}:${port}`);
            // 保存目标主机和端口信息
            socket.targetHost = host;
            socket.targetPort = port;
            this.initConnection(socket); // 初始化连接
        })

        socket.on('error', (err) => {
            console.log(`连接节点失败 ${host}:${port}：`, err.message);
        })
        return socket;
    }
    // 关闭所有连接
    closeConnection() {
        this.peers.forEach(peer => {
            try {
                peer.destroy(); // 立即释放测试或退出时的连接。
            } catch (err) {
                console.log(`关闭连接失败：${err.message}`);
            }
        });
        this.peers = []; // 清空连接数组
        if (this.server) {
            this.server.close();
            this.server = null;
            this.serverPort = null;
        }
        console.log('所有连接已关闭。');
    }
    //广播最新区块
    broadcastLatest() {
        this.broadcast(Messages.sendLatestBlock(this.blockchain.latestBlock));
    }
    // 向所有连接的节点广播消息
    broadcast(message) {
        this.peers.forEach(peer => {
            this.write(peer, message);
        });
    }
    // 向指定节点发送消息
    write(peer, message) {
        peer.write(JSON.stringify(message));
    }
    //初始化新连接
    initConnection(connection) {
        // 检查是否已经连接过这个对等节点
        const existingPeer = this.peers.find(peer => {
            return peer.remoteAddress === connection.remoteAddress && peer.remotePort === connection.remotePort
        });
        if (!existingPeer) {
            // 记录节点的连接信息
            connection.peerInfo = {
                host: connection.targetHost || connection.remoteAddress,
                port: connection.targetPort || connection.remotePort,
                connectedAt: new Date()
            };
            
            this.peers.push(connection); // 添加到连接数组
            this.initMessageHandler(connection); // 初始化消息处理器
            this.initErrorHandler(connection); // 初始化错误处理器
            
            // 如果本节点已经启动了服务器，发送握手消息告知对方自己的监听端口
            if (this.serverPort) {
                this.write(connection, Messages.sendHandshake(this.serverPort));
            }
            
            this.write(connection, Messages.getLatestBlock()); // 发送最新区块的消息
            console.log(`新节点连接：${connection.remoteAddress}:${connection.remotePort}`);
        }
    }
    // 初始化消息处理器
    initMessageHandler(connection) {
        // TCP 不保留消息边界；按 JSON 的括号层级拆包，并忽略字符串内的括号。
        // setEncoding 会保留跨数据包的 UTF-8 字符，避免中文被截断。
        connection.setEncoding('utf8');
        let buffer = '';
        let depth = 0;
        let inString = false;
        let escaped = false;
        connection.on("data", data => {
            for (const char of data) {
                if (!buffer && /\s/.test(char)) continue;
                if (!buffer && char !== '{') {
                    connection.destroy(new Error('消息必须为 JSON 对象'));
                    return;
                }
                buffer += char;
                if (buffer.length > 1024 * 1024) {
                    connection.destroy(new Error('单条消息超过 1 Mi 字符限制'));
                    return;
                }
                if (inString) {
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === '"') inString = false;
                } else if (char === '"') {
                    inString = true;
                } else if (char === '{' || char === '[') {
                    depth++;
                } else if (char === '}' || char === ']') {
                    depth--;
                }
                if (depth === 0) {
                    try {
                        this.handleMessage(connection, JSON.parse(buffer));
                    } catch (err) {
                        console.error(`消息无效：${err.message}`);
                        connection.destroy();
                        return;
                    }
                    buffer = '';
                }
            }
        });
    }
    // 初始化错误处理器
    initErrorHandler(connection) {
        connection.on("error", err => {
            console.error(`连接错误：${err.message}`);
            // 从peers数组中移除断开的连接
            this.peers = this.peers.filter(peer => peer !== connection);
        });
        
        // 添加连接关闭处理器
        connection.on("close", () => {
            console.log(`连接已关闭：${connection.peerInfo?.host || connection.remoteAddress}:${connection.peerInfo?.port || connection.remotePort}`);
            // 从peers数组中移除关闭的连接
            this.peers = this.peers.filter(peer => peer !== connection);
        });
    }
    // 处理接收到的消息
    handleMessage(peer, message) {
        if (!message || typeof message !== 'object' || !Number.isInteger(message.type)) {
            throw new TypeError('消息结构无效');
        }
        switch (message.type) {
            case HANDSHAKE:
                // 收到握手消息，更新对等节点的真实监听端口
                Messages.sendHandshake(message.data?.port);
                peer.peerInfo = { ...peer.peerInfo, port: message.data.port };
                console.log(`收到握手消息，节点端口更新为 ${message.data.port}`);
                break;
            case REQUEST_LATEST_BLOCK:
                // 当收到请求最新区块的消息时，发送最新区块
                this.write(peer, Messages.sendLatestBlock(this.blockchain.latestBlock));
                break;
            case REQUEST_LATEST_BLOCKCHAIN:
                // 当收到请求整个区块链的消息时，发送整个区块链
                this.write(peer, Messages.sendBlockchain(this.blockchain.get()));
                break;
            case RECEIVE_LATEST_BLOCK:
                // 当收到最新区块时，处理该区块
                this.handleReceivedLatestBlock(message, peer);
                break;
            case RECEIVE_LATEST_BLOCKCHAIN:
                // 当收到整个区块链时，处理该区块链
                this.handleReceivedBlockchain(message);
                break;
            default:
                throw new Error('收到无效消息类型');
        }
    }
    // 处理接收到的最新区块
    handleReceivedLatestBlock(message, peer) {
        const receivedBlock = Messages.sendLatestBlock(message.data).data;
        const latestBlock = this.blockchain.latestBlock; // 获取本地最新区块

        // 如果接收到的区块可以连接到当前链
        if (latestBlock.hash === receivedBlock.previousHash) {
            try {
                this.blockchain.addBlock(receivedBlock); // 添加新区块
                this.broadcastLatest(); // 让已验证的新区块继续传给其他邻居。
            } catch (err) {
                throw err;
            }
        } else if (receivedBlock.index > latestBlock.index) {
            // 如果接收到的区块索引更大，说明可能有更长的链，请求整个区块链
            this.write(peer, Messages.getBlockchain());
        } else {
            // 其他情况不做处理
        }
    }
    // 处理接收到的整个区块链
    handleReceivedBlockchain(message) {
        const receivedChain = message.data; // 获取接收到的区块链

        try {
            this.blockchain.replaceChain(receivedChain); // 替换本地区块链
            this.broadcastLatest();
        } catch (err) {
            throw err;
        }
    }
}

module.exports = PeerToPeer;
