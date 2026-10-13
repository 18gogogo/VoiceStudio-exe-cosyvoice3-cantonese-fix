<div align="center">

# VoiceStudio / CosyVoice3 粵語（廣東話）修復

**兩處修復：先讓下拉選單出現 Cantonese，再讓 CosyVoice3 真正讀出粵語**

*成功與失敗的經驗全記錄，讓同路人不必再摸索*

<script type="text/javascript" src="https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js" data-name="bmc-button" data-slug="tenantreview" data-color="#FFDD00" data-emoji="☕"  data-font="Cookie" data-text="Buy me a coffee" data-outline-color="#000000" data-font-color="#000000" data-coffee-color="#ffffff" ></script>

</div>

---

## 問題

在 VoiceStudio 的 **Dub（配音）** 或 **TTS** 功能中選擇 `Cantonese / 粵語 / yue` 之後，生成出來的語音**仍然是普通話**發音。文字是方塊字（繁體或簡體都一樣），但聲音卻是普通話。

---

> ### ⚠️ 必須修改兩處，缺一不可
>
> | # | 檔案 | 解決什麼問題 |
> | :-- | :--- | :--- |
> | **1** | `resources/app.asar` | 下拉選單**根本沒有** `Cantonese` 可選 → 見下方「**第一步**」 |
> | **2** | `backend/engines/cosyvoice_subprocess/main.py` | 即使選了**仍然讀成普通話**（引擎層問題）→ 見下方「**第二步**」 |
>
> 只做第 2 步：沒有東西可以選。只做第 1 步：選了依然是普通話。

---

## 🔧 第一步：讓下拉選單出現 Cantonese（修改 `app.asar`）

### 為什麼需要

原版 `app.asar` 的語言清單中**根本沒有 `yue`**，因此連選都無從選起：

```js
// frontend/src/utils/languages.js（打包後位於 out/renderer/assets/index-*.js）
var LANG_CODES = [ … ];

// Dub 頁面用它產生下拉選項：
var targetOptions = LANG_CODES.map((item) => item.label);

// 選定後以 label 取回 code，再傳給後端：
LANG_CODES.find((item) => item.label === language)?.code   // 例如 "Cantonese" -> "yue"
```

沒有這一行 → 下拉沒有 `Cantonese` → 後端無論如何修復都無用武之地。

### 修改位置

| 項目 | 值 |
| :--- | :--- |
| 檔案 | `out/renderer/assets/index-DjfLeGkU.js` |
| 位置 | `LANG_CODES` 陣列，`my`（Burmese）與 `ca`（Catalan）之間 |
| 大小 | 1,569,605 → 1,569,648 bytes（**+43**） |
| SHA256 | `2a5e53e1…` → `c00c043a…` |

```diff
 	},
+	{
+		code: "yue",
+		label: "Cantonese"
+	},
 	{
 		code: "ca",
 		label: "Catalan"
```

> ⚠️ 檔名後綴 `DjfLeGkU` 是 build hash，**每個 VoiceStudio 版本都不同**。不要死記檔名，必須用**內容特徵**來查找（下方的腳本就是這樣做的）。

> 💡 在 `app.asar` 中搜尋 `Cantonese` 時，可能會找到第二個檔案 `language-picker-*.js` — 那是 **Whisper 轉錄（ASR）語言**清單（大量 ISO 639-3 罕見語言名稱），與輸出語言**無關**，不必修改。經確認它在原版與 patch 版中同為 40,892 bytes、內容一致。

### 為什麼不能「直接修改 bytes」

`app.asar` 開頭是一個 **14,250,656 bytes 的 JSON header**，其中記錄了：

- **53,774** 個檔案的路徑
- 每個檔案的 **SHA256 integrity hash**
- 每個檔案在 data section 中的 **byte offset**

若直接插入 43 bytes，其後所有 offset 全部錯位、hash 全部不符。某些 Electron build 會校驗 integrity，會立即崩潰。

**唯一正確的做法：`extract` → 修改 → `pack`**，交由 asar 工具自動重算 hash 與 offset。

### 一鍵腳本

[`scripts/patch-app-asar.mjs`](scripts/patch-app-asar.mjs)

```sh
node scripts/patch-app-asar.mjs "C:\Path\To\VoiceStudio\resources\app.asar"
```

- 自動備份為 `app.asar.original`（已有備份則不覆蓋）
- 用**內容特徵**（`label: "Catalan"`）查找目標檔，不依賴檔名 → 版本更新後依然正確
- **具備冪等性**：已 patch 過則直接跳過
- 自動偵測行尾（LF / CRLF），不會產生多餘差異
- repack 之後列印 size / sha256 供核對

**需求**：Node.js + 聯網（`npx` 會下載 `@electron/asar`）。Windows 若 `npx` 被 Execution Policy 攔截，腳本會自動改走 `cmd /c`。

### 如何確認它確實正確

1. 由 `app.asar.original` 執行一次腳本
2. 輸出 **470,747,695 bytes，SHA256 `BD5A21CE…49CCE`**
3. 與已經實測可用的 `app.asar` **逐 byte 完全相同** — header 14,250,656 bytes 完全一致、53,774 個檔案 entries **零差異**、目標 JS 內容 byte-exact

| 檔案 | 大小 | SHA256 |
| :--- | ---: | :--- |
| `app.asar.original`（原版備份） | 470,747,652 | `E437D60B3451D012CED7D36AD7FFAD8C14F31B484DF2AD6A532A6EEA0FA92D2E` |
| `app.asar`（已 patch，實測可用） | 470,747,695 | `BD5A21CE6439C8315EAF19595F7C35610E6CEEDD7818352106930B6E84F49CCE` |

（MD5 分別為 `AD85C9328A9701C9AB2D2B25EC004F2D` 與 `6C9030093A2CFAD8B9DA51BDC38C2A76`。）

### 還原

```sh
copy /Y app.asar.original app.asar
```

### 風險 / 注意事項

- **VoiceStudio 更新會覆蓋 `app.asar`** → 每次更新之後必須重跑一次腳本
- 修改後**必須完全退出** VoiceStudio（確保 Electron 與後端 process 全部結束）再重新啟動才生效
- 不同版本的語言清單結構有可能變動 → 腳本找不到錨點時會**明確報錯**，而不是亂改
- 只新增一個選項，**不影響任何其他語言**的行為

---

## 根因（Root Cause）

查找了很久，最終發現是**四層問題疊加**：

### 1. CosyVoice3 根本沒有語言標籤 token

CosyVoice **v1/v2** 有 `<|zh|>`、`<|en|>`、`<|yue|>` 等語言 token。CosyVoice **3** 沒有：

```python
tokenizer.convert_tokens_to_ids("<|endofprompt|>")   # 151646  ✅ 存在
tokenizer.convert_tokens_to_ids("<|yue|>")           # None    ❌ 不存在
tokenizer.convert_tokens_to_ids("<|zh|>")            # None    ❌ 不存在
```

回傳 `None` 之後，tokenizer 會把它拆成 `< | y ue | >` 這樣的**字元碎片**。所以程式碼中那個 `LANG_TAGS` 字典前綴，其實是一個**無效的安慰劑**——加上等於沒加。

### 2. v3 分支根本沒有使用 lang tag

sidecar 中 `_run_model()` 的 v3 路徑有三個分支：

| 分支 | 條件 | 有無語言控制 |
| :--- | :--- | :--- |
| `inference_instruct2` | 有 `instruct` + `ref_audio` | ❌ 沒有（除非 instruct 內容有說明） |
| `inference_zero_shot` | 有 `ref_audio` + `ref_text` | ❌ **完全沒有** |
| `inference_sft` | 沒有 `ref_audio` | ❌ 沒有 |

唯一用到 lang tag 的 `inference_cross_lingual` 分支，v3 不會走到。

### 3. Dub 必定進入 zero-shot 分支

Dub 場景一定有參考音頻與轉錄文字（speaker clone + ASR）：

```
ref_audio ✅ + ref_text ✅  →  inference_zero_shot  →  沒有任何語言資訊
```

模型只能依靠**文字本身**來推測語言。CosyVoice 的 `text_normalize` 中有 `contains_chinese` 判定，無論你提供繁體還是簡體，都會判定為 `zh` → 普通話。

### 4. 官方唯一的語言控制方法 = instruct 文字

CosyVoice3 官方 `example.py` 中的粵語示範是這樣的：

```python
model.inference_instruct2(
    "……",
    "You are a helpful assistant. 请用广东话表达<|endofprompt|>",
    prompt_wav,
)
```

**這才是官方認可的語言開關。**

---

## ❌ 失敗的嘗試（幫你節省時間）

以下全部是實測結果，使用**同一段文字 + 同一個參考音頻**：

| 嘗試的指令 | 結果 |
| :--- | :--- |
| 繁體「請用香港廣東話表達」 | 🔴 **崩潰** — 只生成 **0.2 秒**音頻，基本上無聲 |
| 簡體「请用香港广东话表达」 | 🔴 輸出仍為普通話 |
| 簡體「请用粤语表达」 | 🔴 輸出仍為普通話 |
| 簡體「请用广东话说」 | 🔴 輸出仍為普通話 |
| 簡體「请用广东话来读」 | 🟡 勉強勝出，但轉錄出現重複字，不穩定 |
| 依賴 `<|yue|>` lang token 生效 | 🔴 無效（token 不在 vocab 中） |
| Traditional 字形的語言指令 | 🔴 模型崩潰，輸出極短 |

> **教訓**：指令必須使用**簡體字**，而且字眼要**與官方 example 逐字一致**。多加兩個字「香港」、或改用「粤语」，都會令模型退回普通話。

---

## ✅ 第二步：讓引擎真正輸出粵語（修改 `main.py`）

### 簡體指令 `请用广东话表达`

唯一**穩定勝出**的字串，與官方 `example.py` 逐字一致。

**原理**：當 `language == "yue"` 時，將語言指令注入 instruct，然後改走 `inference_instruct2`（這是 v3 唯一具備語言控制能力的路徑）。

### 修改內容

修改檔案：`backend/engines/cosyvoice_subprocess/main.py`

**1️⃣ 新增語言指令對照表**

```python
#: CosyVoice 3 ships no language-tag tokens (``<|yue|>`` is not in its vocab),
#: so the ONLY way to steer the spoken variety is the instruct string.
_LANG_INSTRUCT = {
    "yue": "请用广东话表达",
}
```

**2️⃣ 新增查表函式**

```python
def _lang_instruct(language) -> str:
    """Language-variety instruct for v3 (which has no language tokens)."""
    if not language:
        return ""
    full = str(language).lower()
    return _LANG_INSTRUCT.get(full) or _LANG_INSTRUCT.get(full[:2], "")
```

**3️⃣ 在 `_run_model()` 中注入語言提示**

```python
    if v3:
        # v3 has no language tokens, so steer the variety via instruct text.
        # Prepend our language hint to any caller-supplied style instruct.
        lang_hint = _lang_instruct(msg.get("language"))
        if lang_hint:
            instruct = f"{lang_hint} {instruct}".strip() if instruct else lang_hint
            print(
                f"language={msg.get('language')!r} -> instruct={instruct!r}",
                file=sys.stderr,
                flush=True,
            )
    if instruct and ref_audio:
        return model.inference_instruct2(text, _instruct(instruct, v3), ref_audio, stream=False)
```

**設計重點**：

- **只對 `yue` 生效** — 其他語言完全不受影響，零回歸風險
- **有 caller instruct 時自動合併** — 語言提示在前、樣式指令在後，例如 `请用广东话表达 请用温柔的语气`
- **`zh` / 無語言照舊走 zero-shot** — 行為完全不變

完整 diff 見 [`patches/cosyvoice3-cantonese.patch`](patches/cosyvoice3-cantonese.patch)。

---

## 驗證結果

使用 faster-whisper `large-v3`（GPU）強制語言對比 `avg_logprob`（數值越高 = 越吻合）：

### 對照組（證明偵測方法有效）

| 樣本 | yue_lp | zh_lp | 判定 |
| :--- | ---: | ---: | :--- |
| 基準：無 instruct | -3.54 | **-0.96** | 普通話 ✅ |
| 基準：已知粵語指令 | **-0.61** | -0.72 | 粵語 ✅ |

### 修復後（透過真實後端 `POST /generate` 端到端測試）

| 請求 | yue_lp | zh_lp | 判定 |
| :--- | ---: | ---: | :--- |
| `language=yue` | **-0.39** | -0.52 | **粵語 ✅** |
| `language=yue` + 樣式指令 | **-0.54** | -0.62 | **粵語 ✅** |
| `language=yue` + 語氣指令 | **-0.36** | -0.42 | **粵語 ✅** |
| `language=zh` | -0.41 | **-0.33** | 普通話 ✅ |
| `language=zh` + 樣式指令 | -0.35 | **-0.24** | 普通話 ✅ |
| 無 `language` | -0.60 | **-0.52** | 普通話 ✅ |

**結論**：所有 `yue` 案例都勝出，所有非 `yue` 案例維持普通話 — 規律完全一致，**零回歸**。

### 排錯用 debug log

修復後，後端 log 會顯示一行，方便確認是否生效：

```
language='yue' -> instruct='请用广东话表达'
```

如果選了粵語但 log 沒有這一行，代表 `language` 根本沒有傳到引擎。

---

## 如何套用（How to apply）

### 前提

- VoiceStudio 已安裝並使用 **CosyVoice3** 引擎（`Fun-CosyVoice3-0.5B`）
- 第一步需要 **Node.js**（腳本會透過 `npx` 取得 `@electron/asar`）
- 兩步完成後**必須完全退出並重新啟動 app** 才生效

> 🔧 **引擎本身還沒裝好？** 一鍵安裝 CosyVoice3 引擎的完整踩坑記錄（依賴衝突、bf16 精度陷阱、`sys.path`、磁碟空間、可續跑機制）見 [`docs/cosyvoice3-engine-install.md`](docs/cosyvoice3-engine-install.md)。

### 第一步 — `app.asar`：讓下拉出現 `Cantonese`

```sh
node scripts/patch-app-asar.mjs "C:\Path\To\VoiceStudio\resources\app.asar"
```

腳本會自動備份為 `app.asar.original`，完成後列印 size / sha256 供核對。

### 第二步 — `main.py`：讓引擎真正輸出粵語

目標檔案：`resources/backend/engines/cosyvoice_subprocess/main.py`

部分安裝有**兩份副本**（`resources/` 與 `project/backend/`）。如果兩份都存在，**兩份都要修改，而且必須保持一致**。

Patch 中的路徑是 `backend/...`，因此必須在 `resources` 目錄中執行：

```sh
cd /d Path\To\VoiceStudio\resources
git apply --verbose Path\To\cosyvoice3-cantonese.patch
```

或者依照「第二步」章節中的三段修改手動加入。

### 重新啟動

完全退出 VoiceStudio（確保 Electron 與後端 process 已結束），再重新啟動。

### 驗證

1. Dub 的目標語言下拉應該出現 **`Cantonese`**（第一步成果）
2. 選擇 `Cantonese` 生成一段，然後查看後端 log 是否有：

```
language='yue' -> instruct='请用广东话表达'
```

診斷：

| 現象 | 代表 |
| :--- | :--- |
| 下拉**沒有** `Cantonese` | 第一步未做，或 app 更新後覆蓋了 `app.asar` → 重跑腳本 |
| 下拉有，但 log **沒有**該行 | `language` 根本沒有傳到引擎 |
| log 有，但結果是**普通話** | 引擎 patch 未生效 → 確認兩份 `main.py` 都已修改，以及是否確實重新啟動 |

### 如果你原本使用其他語言

不必擔心。兩處修改都**只在 `yue` 時觸發**，英語、日語、普通話等路徑一行都沒有變動。

---

## 想加入其他語言？

在 `_LANG_INSTRUCT` 中加一行即可（但**必須實測**，不要靠猜）：

```python
_LANG_INSTRUCT = {
    "yue": "请用广东话表达",
    # "xx": "请用xx语表达",   # 加入之前一定要實測！
}
```

> ⚠️ **必須使用簡體字**，並且實測確認有效。從這次經驗來看，指令字眼的細微差異（加字、換字、換字形）都會令結果由「有效」變成「完全無效」甚至「模型崩潰」。

---

## 鳴謝 / Credits

這個修復建立在以下優秀的開源項目之上，謹此致謝：

| 項目 | 作者 | 授權 | 貢獻 |
| :--- | :--- | :--- | :--- |
| **[VoiceStudio](https://github.com/debpalash/VoiceStudio)** | [Debpalash](https://github.com/debpalash) | AGPL-3.0 | 被修復的應用程式，本 patch 所修改的 `main.py` 原始作者 |
| **[CosyVoice](https://github.com/FunAudioLLM/CosyVoice)** | [FunAudioLLM / 阿里巴巴](https://github.com/FunAudioLLM) | Apache-2.0 | CosyVoice3 模型、`example.py` 粵語 instruct 用法（本修復的關鍵靈感來源） |
| **OmniVoice** | [Han Zhu](https://github.com/hanzhi713) | Apache-2.0 | VoiceStudio 預設 TTS 模型 |

> 本 repo 的 patch 與腳本均以 **AGPL-3.0** 授權（與 VoiceStudio 上游一致）。修改過的 `main.py` 及 `app.asar` 內原始著作權屬 **Debpalash / VoiceStudio** 所有，請繼續遵守上游授權條款。

---

## 作者

**修復與記錄：[18gogogo](https://github.com/18gogogo)**

如果這份筆記對你有幫助，歡迎請我喝杯咖啡 ☕

[![Buy me a coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/tenantreview)

---

<sub>AGPL-3.0 · 上游著作權歸 <a href="https://github.com/debpalash/VoiceStudio">Debpalash / VoiceStudio</a> 及 <a href="https://github.com/FunAudioLLM/CosyVoice">FunAudioLLM / CosyVoice</a> 所有</sub>
