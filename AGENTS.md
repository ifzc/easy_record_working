# Repository Guidelines

## 项目结构与模块组织
- `app/`：Next.js App Router 页面与布局，入口 `app/page.tsx`，全局样式在 `app/globals.css`。
- `public/`：静态资源（图标、图片）。
- `.next/`：构建产物，本地生成无需提交。
- 关键配置在 `next.config.ts`、`tsconfig.json`、`eslint.config.mjs`、`postcss.config.mjs`。

## 构建、测试与开发命令
- `npm run dev`：启动本地开发服务器（默认 http://localhost:3000）。
- `npm run build`：生成生产构建产物。
- `npm run start`：运行生产构建。
- `npm run lint`：执行 ESLint 检查。

## 编码风格与命名规范
- TypeScript + React，`tsconfig.json` 开启 `strict`，避免 `any`。
- 文件使用 `.ts/.tsx`，组件名 PascalCase；路由段保持小写。
- 采用 2 空格缩进、双引号字符串，与现有代码保持一致。
- UI 使用 Tailwind CSS 类名，通用样式放在 `app/globals.css`。

## 测试指南
- 当前未配置测试框架或覆盖率要求。
- 若新增测试，建议使用 `*.test.tsx` 或 `__tests__/`，并在 `package.json` 添加 `test` 脚本。

## 提交与 PR 指南
- 此目录未包含 `.git`，无法从历史推断提交规范。
- 推荐采用 Conventional Commits（如 `feat: ...`、`fix: ...`）。
- PR 请说明变更动机、影响范围、验证步骤；UI 变更附截图。

## 安全与配置
- 机密配置建议放在 `.env.local` 并避免提交。
- 部署到 Vercel 时对照 `next.config.ts` 与环境变量设置。
