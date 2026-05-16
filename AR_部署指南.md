# AR部署指南

## 上传并覆盖到 GitHub

1. 打开你的仓库：`https://github.com/你的用户名/ar-anatomy`
2. 点 **"Add file"** → **"Upload files"**
3. 将 `ar_anatomy/` 文件夹里的 **4个文件** 拖入上传区域：

   ```
   index.html
   style.css  
   app.js
   README.md
   ```

4. ⚠️ **重要：** 在底部 Commit 信息区域，写：

   ```
   修复：添加开始按钮，兼容iOS，优化CDN加载
   ```

5. **勾选** ☑️ `Commit directly to the main branch`
6. 点 **"Commit changes"**

文件会**自动覆盖**旧版本。等1-2分钟，访问：
```
https://你的用户名.github.io/ar-anatomy
```

## 如果GitHub打不开

把文件发给我，我帮你处理。
