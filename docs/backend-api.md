# 易记工 后端数据库与接口设计（供后端AI开发）

本文档基于当前前端已实现功能：登录（账号+密码）、租户隔离、工时总览、员工管理、修改密码。

## 1. 目标与约定
- SaaS 多租户隔离：所有业务数据均按 tenant_id 隔离。
- 登录凭证：账号+密码，返回 Token（JWT 或 Session Token 均可）。
- 时间格式：日期 YYYY-MM-DD，月份 YYYY-MM，时间戳为 ISO 8601。
- 工时单位：小时，支持 0.5 步进（可按业务调整）。
- 工计算：正常班次工时/8 + 加班工时/6（计算字段，默认不落库）。

## 2. 数据库表设计

### 2.1 tenants（租户表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK | 租户 ID |
| code | varchar(50) | UNIQUE | 租户标识（如 tenant-a） |
| name | varchar(100) | NOT NULL | 租户名称 |
| status | varchar(20) | NOT NULL | active / disabled |
| created_at | timestamp | NOT NULL | 创建时间 |
| updated_at | timestamp | NOT NULL | 更新时间 |

索引建议：idx_tenants_code。

### 2.2 users（用户表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK | 用户 ID |
| tenant_id | uuid | FK -> tenants.id | 所属租户 |
| account | varchar(100) | NOT NULL | 登录账号 |
| password_hash | varchar(255) | NOT NULL | 密码哈希 |
| display_name | varchar(100) |  | 显示名 |
| role | varchar(20) | NOT NULL | admin / member |
| status | varchar(20) | NOT NULL | active / disabled |
| created_at | timestamp | NOT NULL | 创建时间 |
| updated_at | timestamp | NOT NULL | 更新时间 |

约束建议：UNIQUE (tenant_id, account)。

### 2.3 employees（员工表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK | 员工 ID |
| tenant_id | uuid | FK -> tenants.id | 所属租户 |
| name | varchar(50) | NOT NULL | 员工姓名 |
| type | varchar(10) | NOT NULL | 正式工 / 临时工 |
| is_active | boolean | NOT NULL DEFAULT true | 是否有效（软删除） |
| created_at | timestamp | NOT NULL | 创建时间 |
| updated_at | timestamp | NOT NULL | 更新时间 |

索引建议：idx_employees_tenant、idx_employees_name、idx_employees_active。

### 2.4 time_entries（记工表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK | 记工 ID |
| tenant_id | uuid | FK -> tenants.id | 所属租户 |
| employee_id | uuid | FK -> employees.id | 员工 ID |
| work_date | date | NOT NULL | 记工日期 |
| normal_hours | decimal(5,2) | NOT NULL DEFAULT 8 | 正常班次工时 |
| overtime_hours | decimal(5,2) | NOT NULL DEFAULT 0 | 加班工时 |
| created_at | timestamp | NOT NULL | 创建时间 |
| updated_at | timestamp | NOT NULL | 更新时间 |

索引建议：idx_time_entries_tenant_date、idx_time_entries_employee、idx_time_entries_date_employee。

约束建议：UNIQUE (tenant_id, employee_id, work_date)（若允许同员工一天多条则取消）。

### 2.5 auth_sessions（可选，会话表）

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | uuid | PK | 会话 ID |
| user_id | uuid | FK -> users.id | 用户 ID |
| token | varchar(255) | UNIQUE | 会话 Token |
| expires_at | timestamp | NOT NULL | 过期时间 |
| created_at | timestamp | NOT NULL | 创建时间 |

## 3. 接口规范

### 3.1 通用规范
- Base URL：/api
- 响应结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

- 错误示例：

```json
{
  "code": 40001,
  "message": "参数错误",
  "details": "normal_hours must be >= 0"
}
```

- 鉴权：除登录与协议页外，其余接口均需 Token。
- 多租户隔离：后端从 Token 获取 tenant_id，所有查询自动附加 tenant_id 过滤。

## 4. 登录与账号

### 4.1 登录
POST /api/auth/login

Body：
```json
{
  "account": "租户A/管理员",
  "password": "123456"
}
```

返回：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "jwt-or-session-token",
    "user": {
      "id": "uuid",
      "account": "租户A/管理员",
      "display_name": "管理员",
      "role": "admin"
    },
    "tenant": {
      "id": "uuid",
      "code": "tenant-a",
      "name": "租户A"
    }
  }
}
```

说明：
- 账号可包含租户信息（如 租户A/管理员 或 admin@tenant-a），后端自行解析或直接查 tenant_id + account。
- 若租户或用户被禁用，返回 403。

### 4.2 获取当前登录用户
GET /api/auth/me

返回：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user": { "id": "uuid", "account": "租户A/管理员", "role": "admin" },
    "tenant": { "id": "uuid", "name": "租户A" }
  }
}
```

### 4.3 修改密码
POST /api/auth/change-password

Body：
```json
{
  "current_password": "123456",
  "new_password": "654321"
}
```

校验建议：
- current_password 必须正确
- new_password 最小长度 6（可按策略调整）

### 4.4 退出登录（可选）
POST /api/auth/logout

说明：JWT 场景可仅由前端清理 Token；Session 场景需销毁服务器会话。

## 5. 员工管理

### 5.1 获取员工列表
GET /api/employees

Query：
- keyword：姓名模糊搜索
- type：正式工 / 临时工
- is_active：true/false（默认 true）
- page / page_size
- sort：name_asc / created_at_desc（可选）

返回字段：id, name, type, is_active, created_at, updated_at

### 5.2 新增员工
POST /api/employees

Body：
```json
{
  "name": "张强",
  "type": "正式工"
}
```

### 5.3 编辑员工
PUT /api/employees/{id}

Body（可选字段）：
```json
{
  "name": "张强",
  "type": "临时工",
  "is_active": true
}
```

### 5.4 删除员工（软删除）
DELETE /api/employees/{id}

行为：设置 is_active=false。

### 5.5 导入员工（CSV）
POST /api/employees/import

- Content-Type：multipart/form-data
- 表单字段：file

CSV 示例：
```
员工姓名,员工类型
张强,正式工
李娜,临时工
```

返回：
```json
{
  "code": 0,
  "message": "ok",
  "data": { "imported": 10, "skipped": 2 }
}
```

### 5.6 导出员工（CSV）
GET /api/employees/export?format=csv&is_active=true

返回文件流，文件名示例：员工管理_2026-01-18.csv。

## 6. 记工明细

### 6.1 获取指定日期记工列表
GET /api/time-entries

Query：
- date：必填，YYYY-MM-DD
- keyword：员工姓名模糊搜索
- employee_type：正式工 / 临时工
- sort：hours_asc / hours_desc
- page / page_size

返回字段：
- id, employee_id, employee_name, employee_type, work_date
- normal_hours, overtime_hours, total_hours, work_units

### 6.2 新增记工
POST /api/time-entries

Body：
```json
{
  "employee_id": "uuid",
  "work_date": "2026-01-01",
  "normal_hours": 8,
  "overtime_hours": 2
}
```

校验建议：
- normal_hours >= 0，overtime_hours >= 0
- 小数步进 0.5（可选）
- 若存在唯一约束，重复返回 409

### 6.3 编辑记工
PUT /api/time-entries/{id}

Body 同新增。

### 6.4 删除记工
DELETE /api/time-entries/{id}

### 6.5 日历统计（按月）
GET /api/time-entries/summary?month=YYYY-MM

返回：
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    { "date": "2026-01-01", "total_hours": 16, "headcount": 2 },
    { "date": "2026-01-02", "total_hours": 10, "headcount": 1 }
  ]
}
```

说明：headcount 为当日 distinct 员工数。日历下方统计可用此接口按 date 过滤，或扩展 GET /api/time-entries/summary?date=YYYY-MM-DD。

## 7. 多租户隔离实现建议
- 所有业务表均含 tenant_id，所有查询必须带 tenant_id。
- 数据库支持时可用 RLS（Row Level Security）进一步隔离。
- 登录成功后 Token 中包含 tenant_id 与 user_id，后端从 Token 解析，不允许前端传入。

## 8. 对接前端关键点
- 登录：前端只提供 account + password。
- 修改密码：前端提供 current_password 与 new_password。
- 记工明细列表需返回员工姓名、员工类型与计算字段。
- 导入导出优先支持 CSV（Excel 可另存为 CSV）。
