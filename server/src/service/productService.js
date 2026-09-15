/** 商品服务 —— 对齐 mall4j 商品管理（SPU + SKU + 上下架） */
import { mappers } from '../mapper/index.js';
import { BizError } from '../common/R.js';
import { bjNow } from '../common/datetime.js';

const now = () => bjNow();

export const productService = {
  page(params) {
    const { current = 1, size = 20, name, category, status } = params;
    const cond = {};
    if (name) cond.nameLike = name;
    if (category) cond.category = category;
    if (status !== undefined && status !== '') cond.status = Number(status);
    return mappers.product.page(cond, current, size, 'id DESC');
  },
  detail(id) {
    const product = mappers.product.byId(id);
    if (!product) throw new BizError('商品不存在', 'A0404');
    const skus = mappers.sku.list({ spu_code: product.spu_code }, 'id');
    return { ...product, skus };
  },
  create(body) {
    const exist = mappers.product.one({ spu_code: body.spu_code });
    if (exist) throw new BizError('商品编码已存在');
    const row = {
      spu_code: body.spu_code,
      name: body.name,
      category: body.category || '',
      brand: body.brand || '',
      cost: Number(body.cost) || 0,
      price: Number(body.price) || 0,
      market_price: Number(body.market_price) || Number(body.price) || 0,
      stock: Number(body.stock) || 0,
      weight_kg: Number(body.weight_kg) || 0,
      sales: Number(body.sales) || 0,
      status: body.status === undefined ? 1 : Number(body.status),
      created_at: now(),
      remark: body.remark || '',
    };
    const saved = mappers.product.insert(row);
    (body.skus || []).forEach(s => this._upsertSku(saved.spu_code, s));
    return saved;
  },
  update(id, body) {
    const old = mappers.product.byId(id);
    if (!old) throw new BizError('商品不存在', 'A0404');
    const patch = {};
    ['name', 'category', 'brand', 'cost', 'price', 'market_price', 'stock', 'weight_kg', 'remark'].forEach(k => {
      if (body[k] !== undefined) patch[k] = typeof body[k] === 'number' ? body[k] : Number(body[k] || 0);
    });
    if (body.status !== undefined) patch.status = Number(body.status);
    const saved = mappers.product.update(id, patch);
    if (Array.isArray(body.skus)) {
      body.skus.forEach(s => this._upsertSku(old.spu_code, s));
    }
    return saved;
  },
  changeStatus(id, status) {
    const p = mappers.product.byId(id);
    if (!p) throw new BizError('商品不存在', 'A0404');
    mappers.product.update(id, { status: Number(status) });
    mappers.sku.list({ spu_code: p.spu_code }).forEach(s => mappers.sku.update(s.id, { status: Number(status) }));
    return { id, status: Number(status) };
  },
  remove(id) {
    const p = mappers.product.byId(id);
    if (!p) throw new BizError('商品不存在', 'A0404');
    mappers.sku.list({ spu_code: p.spu_code }).forEach(s => mappers.sku.deleteById(s.id));
    mappers.product.deleteById(id);
    return { id };
  },
  categories() {
    return [...new Set(mappers.product.list().map(p => p.category).filter(Boolean))];
  },
  _upsertSku(spuCode, s) {
    const exist = mappers.sku.one({ sku_code: s.sku_code });
    const row = {
      spu_code: spuCode,
      sku_code: s.sku_code,
      spec: s.spec || '',
      cost: Number(s.cost) || 0,
      price: Number(s.price) || 0,
      stock: Number(s.stock) || 0,
      sales: Number(s.sales) || 0,
      status: s.status === undefined ? 1 : Number(s.status),
    };
    return exist ? mappers.sku.update(exist.id, row) : mappers.sku.insert(row);
  },
};
