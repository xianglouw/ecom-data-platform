/**
 * SQLite 数据访问层 —— 基于 sql.js（WebAssembly，零原生编译）
 *
 * 为什么不用 better-sqlite3：它是原生模块，需要 node-gyp + C++ 工具链，
 * 在云端发布沙箱里没有编译环境，npm install 会直接失败。
 * sql.js 是纯 wasm，任何 Node 环境都能跑。
 *
 * 对外暴露与 better-sqlite3 一致的同步接口（pragma / exec / prepare().all|get|run），
 * 上层 mapper / service 无需改动。写操作后防抖落盘到 .db 文件，进程退出前强制保存。
 */
import fs from 'node:fs';
import path from 'node:path';

let SQL = null;

async function loadSqlJs() {
  if (SQL) return SQL;
  const mod = await import('sql.js');
  const init = mod.default || mod;
  // 显式指定 wasm 位置，避免打包/工作目录变化时定位失败
  let wasmDir;
  try {
    wasmDir = path.dirname(new URL(import.meta.resolve('sql.js/package.json')).pathname);
  } catch {
    wasmDir = undefined;
  }
  SQL = await init(wasmDir ? { locateFile: (f) => path.join(wasmDir, 'dist', f) } : {});
  return SQL;
}

/** sql.js 的 {columns, values} 转成对象数组 */
function toObjects(res) {
  if (!res || !res.length || !res[0].columns) return [];
  const { columns, values } = res[0];
  return values.map((row) => {
    const o = {};
    columns.forEach((c, i) => (o[c] = row[i]));
    return o;
  });
}

class Statement {
  constructor(db, sql, persist) {
    this.db = db;
    this.sql = sql;
    this.persist = persist;
  }
  _bind(params) {
    if (!params || !params.length) return undefined;
    return params.map((p) => (p === undefined ? null : p));
  }
  all(...params) {
    return toObjects(this.db.exec(this.sql, this._bind(params)));
  }
  get(...params) {
    return toObjects(this.db.exec(this.sql, this._bind(params)))[0];
  }
  run(...params) {
    if (/^\s*(insert|update|delete|replace)/i.test(this.sql)) {
      this.db.run('PRAGMA foreign_keys = ON');
    }
    const before = this.db.getRowsModified();
    this.db.run(this.sql, this._bind(params));
    const idRes = this.db.exec('SELECT last_insert_rowid() AS id');
    this.persist();
    return {
      changes: this.db.getRowsModified() - before,
      lastInsertRowid: idRes.length ? idRes[0].values[0][0] : 0,
    };
  }
}

/**
 * 打开（或新建）数据库文件，返回兼容 better-sqlite3 用法的句柄
 * @param {string} file 数据库文件路径
 * @param {{ autoFlush?: boolean }} [opts]
 *   autoFlush=true（默认）：进程退出/信号时自动落盘，适合平台库这种单实例场景。
 *   autoFlush=false：由调用方（多租户实例池）自行管理落盘与关闭，
 *   避免每个租户库都注册一份 exit 监听导致监听器泄漏。
 */
export async function openDatabase(file, opts = {}) {
  const { autoFlush = true } = opts;
  const SQL = await loadSqlJs();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = fs.existsSync(file) && fs.statSync(file).size > 0 ? fs.readFileSync(file) : null;
  const db = raw ? new SQL.Database(raw) : new SQL.Database();

  let timer = null;
  let dirty = false;
  const save = () => {
    if (!dirty) return;
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, Buffer.from(db.export()));
      fs.renameSync(tmp, file); // 原子替换，避免写一半进程挂掉导致库损坏
      dirty = false;
    } catch (e) {
      console.error('[DB] 落盘失败:', e.message);
    }
  };
  // 防抖落盘：连续写入只保存一次；进程退出前再强制保存
  const persist = () => {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      save();
    }, 300);
    if (typeof timer.unref === 'function') timer.unref();
  };

  const handle = {
    /** 内部原始句柄，供需要直接操作的场景使用 */
    raw: db,
    pragma: (s) => {
      try {
        db.run('PRAGMA ' + s);
      } catch {
        /* wasm 版不支持的 pragma 直接忽略 */
      }
    },
    exec: (sql) => {
      db.run(sql);
      if (!/^\s*select/i.test(sql)) persist();
    },
    prepare: (sql) => new Statement(db, sql, persist),
    close: () => {
      save();
      db.close();
    },
    save,
  };

  // 进程正常退出 / 收到终止信号时兜底保存（仅平台库需要；租户库由实例池统一管理）
  if (autoFlush) {
    const flush = () => {
      if (timer) clearTimeout(timer);
      save();
    };
    process.once('exit', flush);
    ['SIGINT', 'SIGTERM'].forEach((sig) => {
      process.once(sig, () => {
        flush();
        process.exit(0);
      });
    });
  }

  return handle;
}
