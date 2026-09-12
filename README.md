# Vein Leaves — OpenProcessing 案例

獨立四檔，不依賴 Lab 其餘目錄。本機直接開 `index.html` 即可（需能連 jsDelivr 載 p5）。

## 檔案

| 檔 | 用途 |
|----|------|
| `index.html` | 畫面＋側欄 |
| `style.css` | 面板樣式 |
| `mix-vein.js` | 沿路徑畫線／葉 |
| `sketch.js` | 五欄預覽、手繪、滑桿 |

## 上傳 OpenProcessing

1. [New Sketch](https://openprocessing.org/sketch/create) → 模式改 **HTML/CSS**（才能掛多檔與側欄 DOM）。
2. Files 上傳這四個檔（或依序貼上）。
3. `index.html` 腳本順序必須是：p5 → `mix-vein.js` → `sketch.js`。
4. 若平台已自動注入 p5、畫面出現雙重畫布，刪掉 `index.html` 裡那一行 p5 CDN。
5. 不要上傳整個 MonetLand，也不要掛 `references/`。

## 操作

- 拖曳畫開放曲線；放開後鎖定該筆參數
- Space 清空手繪
- 亂數效果：每筆開畫重抽滑桿
- S 存 PNG · U 收合面板

## 檢討：鉛筆 Y 鏡射（Asemic / `sketch2.js`）

使用者要的是整張 WEBGL 圖做一次 `scale(1, -1, 1)`。我沒有照做，繞了很遠，還讓畫面看起來「完全沒改」。

錯在哪：

1. **把簡單題做成 UV 題。** 先猜筆畫局部 `v`、再猜紙紋 `gl_FragCoord`、再猜 `get()` 貼圖。紙紋是噪音，翻局部 V 幾乎看不出來；使用者說沒改，是對的。
2. **自己加了抵消項。** 後來終於寫了 `scale(1, -1, 1)`，卻把 `aseToGl` 從 `(x - hw, hh - y)` 改成 `(x - hw, y - hh)`。兩次 Y 翻轉相消，視覺等於沒做。這是「沒有成功」的真正原因，不是 WebGL 玄學。
3. **沒有先驗證有沒有翻到。** 改完該對同一顆種子看上下是否對調。我用補償後的結果當成功，等於沒驗。

正確作法（現在的）：

- 點仍用 `(x - hw, hh - y)` 進 WEBGL
- `ortho` 之後只做一次 `scale(1, -1, 1)`，不要再改點的 Y
- `shader()` 會動到矩陣，所以 scale 要加在 `shader()` **之後**
- 鉛筆開著時，紅線導引同步 `y → H - y`，才對得上

以後：使用者給了 `scale(1, -1, 1)` 就先原樣做；不要同時改兩套座標；改方向類 bug 必須對同一 seed 截圖前後對看。
