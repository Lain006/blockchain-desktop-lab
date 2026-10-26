const fs = require('node:fs');
const path = require('node:path');

// 只在校验成功后更新备份；损坏的主文件不会覆盖上一份有效数据。
function jsonStore(file, validate, warn = () => {}) {
  function read(candidate) {
    const value = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    if (!validate(value)) throw new Error('数据校验不通过');
    return value;
  }
  function load() {
    if (!fs.existsSync(file) && !fs.existsSync(`${file}.bak`)) return null;
    try { return read(file); }
    catch (error) {
      try {
        const recovered = read(`${file}.bak`);
        warn(`主文件无法读取，已从有效备份恢复：${path.basename(file)}（${error.message}）`);
        return recovered;
      } catch {
        throw new Error(`数据及备份无法校验，已保留原文件：${path.basename(file)}`);
      }
    }
  }
  function save(value) {
    if (!validate(value)) throw new Error('拒绝保存无效数据');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    const backupTemp = `${file}.bak.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flush: true });
      let previous;
      try { previous = read(file); } catch {}
      if (previous !== undefined) {
        fs.writeFileSync(backupTemp, JSON.stringify(previous, null, 2), { encoding: 'utf8', flush: true });
        fs.renameSync(backupTemp, `${file}.bak`);
      }
      fs.renameSync(temporary, file);
    } catch (error) {
      throw new Error(`保存失败，未提交更改：${error.message}`);
    } finally {
      for (const candidate of [temporary, backupTemp]) {
        try { fs.unlinkSync(candidate); } catch {}
      }
    }
  }
  return { load, save };
}
module.exports = jsonStore;
