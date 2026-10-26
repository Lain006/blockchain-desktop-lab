const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Blockchain = require('../../blockchaindemo/Blockchain');
const jsonStore = require('../../blockchaindemo/json-store');

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blockchain-storage-test-'));
  t.after(() => { if (dir.startsWith(os.tmpdir())) fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
test('追加、长链替换和恢复沿用共识校验；坏主文件恢复有效备份', (t) => {
  const dir = temporary(t);
  const validator = new Blockchain();
  const warnings = [];
  const file = path.join(dir, 'chain.json');
  const store = jsonStore(file, (chain) => validator.isValidChain(chain), (text) => warnings.push(text));
  const chain = new Blockchain({ storage: store });
  chain.mine('第一个区块');
  const other = new Blockchain();
  other.replaceChain(chain.get());
  other.mine('更长有效链');
  chain.replaceChain(other.get());
  assert.deepEqual(new Blockchain({ storage: store }).get(), chain.get());
  assert.throws(() => chain.replaceChain(chain.get()), /等长/);
  fs.writeFileSync(file, '损坏的文件');
  const recovered = new Blockchain({ storage: store });
  assert.equal(recovered.get().length, 2);
  assert.equal(warnings.length, 1);
  fs.writeFileSync(`${file}.bak`, '损坏的备份');
  assert.throws(() => new Blockchain({ storage: store }), /保留原文件/);
  assert.equal(fs.readFileSync(file, 'utf8'), '损坏的文件');
});
test('保存失败：本地挖矿和收到的有效区块均不得改变内存链', (t) => {
  const dir = temporary(t);
  const validator = new Blockchain();
  const file = path.join(dir, 'chain.json');
  const store = jsonStore(file, (chain) => validator.isValidChain(chain));
  const chain = new Blockchain({ storage: store });
  const original = chain.get();
  fs.mkdirSync(`${file}.tmp`);
  assert.throws(() => chain.mine('写入失败测试'), /保存失败/);
  const other = new Blockchain();
  other.mine('接收失败测试');
  assert.throws(() => chain.addBlock(other.latestBlock), /保存失败/);
  assert.throws(() => chain.replaceChain(other.get()), /保存失败/);
  assert.deepEqual(chain.get(), original);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), original);
});
