/**
 * 统一响应封装 —— 对齐 mall4j 的 ServerResponseEntity
 * 成功：{ code: '00000', msg: 'success', data }
 * 失败：{ code: 'A0500', msg: '...' }
 */
export const SUCCESS = '00000';
export const ERROR = 'A0500';
export const PARAM_ERROR = 'A0400';
export const NOT_FOUND = 'A0404';

export class R {
  static ok(data = null, msg = 'success') {
    return { code: SUCCESS, msg, data };
  }
  static fail(msg = '操作失败', code = ERROR) {
    return { code, msg, data: null };
  }
  /** 分页结果 —— 对齐 IPage / PageVO */
  static page(records, total, current, size) {
    return {
      code: SUCCESS,
      msg: 'success',
      data: {
        records,
        total,
        pages: Math.ceil(total / size),
        current: Number(current),
        size: Number(size),
      },
    };
  }
}

/** 业务异常 */
export class BizError extends Error {
  constructor(msg, code = ERROR) {
    super(msg);
    this.code = code;
  }
}
