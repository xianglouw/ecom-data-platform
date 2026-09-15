<template>
  <div>
    <div class="page-card">
      <div class="page-title">
        商品管理
        <el-button type="primary" :icon="Plus" @click="openCreate">新增商品</el-button>
      </div>
      <el-form :inline="true" :model="query" size="small">
        <el-form-item label="商品名称"><el-input v-model="query.name" placeholder="模糊搜索" clearable /></el-form-item>
        <el-form-item label="类目">
          <el-select v-model="query.category" clearable placeholder="全部" style="width:130px">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:110px">
            <el-option label="在售" :value="1" /><el-option label="下架" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" :icon="Search" @click="load">查询</el-button></el-form-item>
      </el-form>

      <el-table :data="records" v-loading="loading" border stripe size="small">
        <el-table-column prop="spu_code" label="商品编码" width="100" />
        <el-table-column prop="name" label="商品名称" min-width="180" />
        <el-table-column prop="category" label="类目" width="90" />
        <el-table-column prop="brand" label="品牌" width="100" />
        <el-table-column label="成本" width="90" align="right">
          <template #default="{ row }">${{ row.cost?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="售价" width="90" align="right">
          <template #default="{ row }"><b>${{ row.price?.toFixed(2) }}</b></template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="80" align="right" />
        <el-table-column prop="sales" label="销量" width="80" align="right" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-switch :model-value="row.status === 1" @change="onStatus(row, $event)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="$router.push(`/ops/product/${row.spu_code}`)">分析</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px;justify-content:flex-end" layout="total, sizes, prev, pager, next"
        :total="total" v-model:current-page="query.current" v-model:page-size="query.size"
        :page-sizes="[10, 20, 50]" @current-change="load" @size-change="load" />
    </div>

    <el-dialog v-model="dialog" :title="form.id ? '编辑商品' : '新增商品'" width="720px">
      <el-form :model="form" label-width="90px" size="small">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="商品编码"><el-input v-model="form.spu_code" :disabled="!!form.id" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="商品名称"><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="类目"><el-input v-model="form.category" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="品牌"><el-input v-model="form.brand" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="成本"><el-input-number v-model="form.cost" :min="0" :precision="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="售价"><el-input-number v-model="form.price" :min="0" :precision="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="市场价"><el-input-number v-model="form.market_price" :min="0" :precision="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="库存"><el-input-number v-model="form.stock" :min="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="重量(kg)"><el-input-number v-model="form.weight_kg" :min="0" :precision="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item></el-col>
        </el-row>
        <div style="margin:6px 0">规格 / SKU</div>
        <el-table :data="form.skus" size="small" border>
          <el-table-column label="SKU 编码"><template #default="{ row }"><el-input v-model="row.sku_code" size="small" /></template></el-table-column>
          <el-table-column label="规格"><template #default="{ row }"><el-input v-model="row.spec" size="small" /></template></el-table-column>
          <el-table-column label="成本"><template #default="{ row }"><el-input-number v-model="row.cost" :min="0" :precision="2" size="small" /></template></el-table-column>
          <el-table-column label="售价"><template #default="{ row }"><el-input-number v-model="row.price" :min="0" :precision="2" size="small" /></template></el-table-column>
          <el-table-column label="库存"><template #default="{ row }"><el-input-number v-model="row.stock" :min="0" size="small" /></template></el-table-column>
        </el-table>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取 消</el-button>
        <el-button type="primary" @click="onSubmit">确 定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { productApi } from '../../api/index.js';

const records = ref([]), total = ref(0), loading = ref(false), categories = ref([]);
const dialog = ref(false);
const query = reactive({ current: 1, size: 20, name: '', category: '', status: '' });
const emptyForm = () => ({ spu_code: '', name: '', category: '', brand: '', cost: 0, price: 0, market_price: 0,
  stock: 0, weight_kg: 0, remark: '', skus: [] });
const form = ref(emptyForm());

async function load() {
  loading.value = true;
  try {
    const d = await productApi.page(query);
    records.value = d.records; total.value = d.total;
  } finally { loading.value = false; }
}
function openCreate() { form.value = emptyForm(); dialog.value = true; }
async function openEdit(row) {
  const d = await productApi.detail(row.id);
  form.value = { ...d };
  dialog.value = true;
}
async function onSubmit() {
  if (form.value.id) await productApi.update(form.value.id, form.value);
  else await productApi.create(form.value);
  ElMessage.success('保存成功');
  dialog.value = false;
  load();
}
async function onStatus(row, val) {
  await productApi.status(row.id, val ? 1 : 0);
  ElMessage.success(val ? '已上架' : '已下架');
  load();
}
async function onDelete(row) {
  await ElMessageBox.confirm(`确认删除商品「${row.name}」？`, '提示', { type: 'warning' });
  await productApi.remove(row.id);
  ElMessage.success('删除成功');
  load();
}
onMounted(async () => {
  categories.value = await productApi.categories();
  load();
});
</script>
