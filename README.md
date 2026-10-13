<div align="center">

# VoiceStudio / CosyVoice3 粵語（廣東話）修復

**兩處修復：令下拉有得揀 Cantonese，再令 CosyVoice3 真正讀出粵語**

*成功同失敗經驗全記錄，等同路人唔使再摸索*

<script type="text/javascript" src="https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js" data-name="bmc-button" data-slug="tenantreview" data-color="#FFDD00" data-emoji="☕"  data-font="Cookie" data-text="Buy me a coffee" data-outline-color="#000000" data-font-color="#000000" data-coffee-color="#ffffff" ></script>

</div>

---

## 問題

喺 VoiceStudio 嘅 **Dub（配音）** 或 **TTS** 功能揀咗 `Cantonese / 粵語 / yue`，生成出嚟嘅語音**仍然係普通話**發音。文字係方塊字（繁體或者簡體都一樣），但把聲就係普通话。

---

> ### ⚠️ 要改兩處，缺一不可
>
> | # | 檔案 | 解決咩 |
> | :-- | :--- | :--- |
> | **1** | `resources/app.asar` | 下拉選單**根本冇** `Cantonese` 可揀 → 見下方「**第一步**」 |
> | **2** | `backend/engines/cosyvoice_subprocess/main.py` | 揀咗都**照樣讀普通話**（引擎層問題）→ 見下方「**第二步**」 |
>
> 只做第 2 步：冇嘢俾你揀。只做第 1 步：揀咗都係普通話。

---

## 🔧 第一步：令下拉選單有 Cantonese（修改 `app.asar`）

### 點解需要

原裝 `app.asar` 嘅語言清單入面**根本冇 `yue`**，所以連揀都冇得揀：

```js
// frontend/src/utils/languages.js（打包後喺 out/renderer/assets/index-*.js）
var LANG_CODES = [ … ];

// Dub 頁用佢嚟產生下拉選項：
var targetOptions = LANG_CODES.map((item) => item.label);

// 揀中之後用 label 攞返 code，再傳俾後端：
LANG_CODES.find((item) => item.label === language)?.code   // 例如 "Cantonese" -> "yue"
```

冇呢行 → 下拉冇 `Cantonese` → 後端點修都無用武之地。

### 改咗邊度

| 項目 | 值 |
| :--- | :--- |
| 檔案 | `out/renderer/assets/index-DjfLeGkU.js` |
| 位置 | `LANG_CODES` 陣列，`my`（Burmese）同 `ca`（Catalan）之間 |
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

> ⚠️ 檔名後綴 `DjfLeGkU` 係 build hash，**每個 VoiceStudio 版本都唔同**。唔好硬記檔名，要用**內容特徵**去搵（下面嘅腳本就係咁做）。

> 💡 你喺 `app.asar` 度 grep `Cantonese` 可能會撈到第二個檔案 `language-picker-*.js` — 嗰個係 **Whisper 轉錄（ASR）語言**清單（成堆 ISO 639-3 罕見語言名），同輸出語言**無關**，唔使改。經確認佢喺原裝同 patch 版都係 40,892 bytes、內容一致。

### 點解唔可以「直接改 bytes」

`app.asar` 開頭係一個 **14,250,656 bytes 嘅 JSON header**，入面記錄住：

- **53,774** 個檔案嘅路徑
- 每個檔案嘅 **SHA256 integrity hash**
- 每個檔案喺 data section 嘅 **byte offset**

你就咁插 43 bytes 入去，後面所有 offset 全部錯位、hash 全部唔吻合。啲 Electron build 會驗 integrity，即場爆。

**唯一正確做法：`extract` → 改 → `pack`**，等 asar 工具自動重算 hash 同 offset。

### 一鍵腳本

[`scripts/patch-app-asar.mjs`](scripts/patch-app-asar.mjs)

```sh
node scripts/patch-app-asar.mjs "C:\Path\To\VoiceStudio\resources\app.asar"
```

- 自動備份做 `app.asar.original`（已有備份就唔覆蓋）
- 用**內容特徵**（`label: "Catalan"`）搵目標檔，唔靠檔名 → 版本更新都啱
- **Idempotent**：已經 patch 過就直接跳過
- 自動偵測行尾（LF / CRLF），唔會整多啲差異
- repack 之後列印 size / sha256 俾你核對

**需求**：Node.js + 聯網（`npx` 會下載 `@electron/asar`）。Windows 如果 `npx` 俾 Execution Policy 擋，腳本會自動 fallback 走 `cmd /c`。

### 點確認佢真係啱

1. 由 `app.asar.original` 跑一次腳本
2. 輸出 **470,747,695 bytes，SHA256 `BD5A21CE…49CCE`**
3. 同已經實測可用嘅 `app.asar` **逐 byte 完全相同** — header 14,250,656 bytes 一模一樣、53,774 個檔案 entries **零差異**、目標 JS 內容 byte-exact

| 檔案 | 大小 | SHA256 |
| :--- | ---: | :--- |
| `app.asar.original`（原裝備份） | 470,747,652 | `E437D60B3451D012CED7D36AD7FFAD8C14F31B484DF2AD6A532A6EEA0FA92D2E` |
| `app.asar`（已 patch，實測可用） | 470,747,695 | `BD5A21CE6439C8315EAF19595F7C35610E6CEEDD7818352106930B6E84F49CCE` |

（MD5 分別係 `AD85C9328A9701C9AB2D2B25EC004F2D` 同 `6C9030093A2CFAD8B9DA51BDC38C2A76`。）

### 還原

```sh
copy /Y app.asar.original app.asar
```

### 風險 / 注意

- **VoiceStudio 更新會覆蓋 `app.asar`** → 每次更新之後要重跑一次腳本
- 改完**必須完全退出** VoiceStudio（確保 Electron 同後端 process 全部結束）再重啟先生效
- 唔同版本嘅語言清單結構有機會改動 → 腳本搵唔到錨點會**明確報錯**而唔係亂改
- 只加一個選項，**唔掂任何其他語言**嘅行為

---

## 根因（Root Cause）

搵咗好耐，最後發現係 **四層問題疊加**：

### 1. CosyVoice3 根本冇語言標籤 token

CosyVoice **v1/v2** 有 `<|zh|>`、`<|en|>`、`<|yue|>` 等語言 token。CosyVoice **3** 冇：

```python
tokenizer.convert_tokens_to_ids("<|endofprompt|>")   # 151646  ✅ 存在
tokenizer.convert_tokens_to_ids("<|yue|>")           # None    ❌ 唔存在
tokenizer.convert_tokens_to_ids("<|zh|>")            # None    ❌ 唔存在
```

回傳 `None` 之後，tokenizer 會將佢拆成 `< | y ue | >` 咁樣嘅**字符碎片**。所以代碼入面嗰個 `LANG_TAGS` 字典前綴，其實係一個**無效嘅安慰劑**——加咗等於冇加。

### 2. v3 分支根本冇用 lang tag

sidecar 入面 `_run_model()` 嘅 v3 路徑有三個分支：

| 分支 | 條件 | 有冇語言控制 |
| :--- | :--- | :--- |
| `inference_instruct2` | 有 `instruct` + `ref_audio` | ❌ 冇（除非 instruct 內容講明） |
| `inference_zero_shot` | 有 `ref_audio` + `ref_text` | ❌ **完全冇** |
| `inference_sft` | 冇 `ref_audio` | ❌ 冇 |

唯一用到 lang tag 嘅 `inference_cross_lingual` 分支，v3 唔會行到去。

### 3. Dub 一定跌入 zero-shot 分支

Dub 場景一定有參考音頻同轉錄文字（speaker clone + ASR）：

```
ref_audio ✅ + ref_text ✅  →  inference_zero_shot  →  冇任何語言資訊
```

模型只能靠**文字本身**去估語言。CosyVoice 嘅 `text_normalize` 內有 `contains_chinese` 判定，無論你畀繁體定簡體，都會判成 `zh` → 普通話。

### 4. 官方唯一嘅語言控制方法 = instruct 文字

CosyVoice3 官方 `example.py` 入面嘅粵語示範係咁樣：

```python
model.inference_instruct2(
    "……",
    "You are a helpful assistant. 请用广东话表达<|endofprompt|>",
    prompt_wav,
)
```

**呢個先係官方認可嘅語言開關。**

---

## ❌ 失敗嘅嘗試（幫你慳返時間）

以下全部係實測出嚟嘅結果，全部用**同一段文字 + 同一個參考音頻**：

| 試嘅指令 | 結果 |
| :--- | :--- |
| 繁體「請用香港廣東話表達」 | 🔴 **崩潰** — 只生成 **0.2 秒**音頻，基本上無聲 |
| 簡體「请用香港广东话表达」 | 🔴 輸出返普通話 |
| 簡體「请用粤语表达」 | 🔴 輸出返普通話 |
| 簡體「请用广东话说」 | 🔴 輸出返普通話 |
| 簡體「请用广东话来读」 | 🟡 勉強勝出，但轉錄出現重複字，唔穩定 |
| 指望 `<|yue|>` lang token 生效 | 🔴 無效（token 唔喺 vocab） |
| Traditional 字形嘅語言指令 | 🔴 模型崩潰，輸出極短 |

> **教訓**：指令必須用**簡體字**，而且字眼要**同官方 example 逐字一致**。加多兩個字「香港」、或者改用「粤语」，都會令模型跌返去普通話。

---

## ✅ 第二步：令引擎真正輸出粵語（修改 `main.py`）

### 簡體指令 `请用广东话表达`

唯一**穩定勝出**嘅字串，同官方 `example.py` 逐字一致。

**原理**：當 `language == "yue"` 時，將語言指令注入 instruct，然後改走 `inference_instruct2`（呢個係 v3 唯一有語言控制能力嘅路徑）。

### 改動內容

修改檔案：`backend/engines/cosyvoice_subprocess/main.py`

**1️⃣ 加一個語言指令對照表**

```python
#: CosyVoice 3 ships no language-tag tokens (``<|yue|>`` is not in its vocab),
#: so the ONLY way to steer the spoken variety is the instruct string.
_LANG_INSTRUCT = {
    "yue": "请用广东话表达",
}
```

**2️⃣ 加一個查表函式**

```python
def _lang_instruct(language) -> str:
    """Language-variety instruct for v3 (which has no language tokens)."""
    if not language:
        return ""
    full = str(language).lower()
    return _LANG_INSTRUCT.get(full) or _LANG_INSTRUCT.get(full[:2], "")
```

**3️⃣ 喺 `_run_model()` 注入語言提示**

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

- **只對 `yue` 生效** — 其他語言完全唔掂，零回歸風險
- **有 caller instruct 時自動合併** — 語言提示在前、樣式指令在後，例如 `请用广东话表达 请用温柔的语气`
- **`zh` / 無語言照舊走 zero-shot** — 行為完全不變

完整 diff 見 [`patches/cosyvoice3-cantonese.patch`](patches/cosyvoice3-cantonese.patch)。

---

## 驗證結果

用 faster-whisper `large-v3`（GPU）強制語言對比 `avg_logprob`（數值越高 = 越吻合）：

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

**結論**：所有 `yue` 案例都勝出，所有非 `yue` 案例維持普通話 — 模式完全一致，**零回歸**。

### 排查用 debug log

修復後，後端 log 會顯示一行，方便確認有冇生效：

```
language='yue' -> instruct='请用广东话表达'
```

如果揀咗粵語但 log 冇呢行，代表 `language` 根本冇傳到引擎。

---

## 點樣套用（How to apply）

### 前提

- VoiceStudio 已安裝並使用 **CosyVoice3** 引擎（`Fun-CosyVoice3-0.5B`）
- 第一步需要 **Node.js**（腳本會透過 `npx` 攞 `@electron/asar`）
- 兩步做完**必須完全退出並重啟 app** 先生效

### 第一步 — `app.asar`：令下拉有 `Cantonese`

```sh
node scripts/patch-app-asar.mjs "C:\Path\To\VoiceStudio\resources\app.asar"
```

腳本自動備份做 `app.asar.original`，改完會列印 size / sha256 俾你對。

### 第二步 — `main.py`：令引擎真正輸出粵語

目標檔案：`resources/backend/engines/cosyvoice_subprocess/main.py`

部分安裝有**兩份副本**（`resources/` 同 `project/backend/`）。如果兩份都存在，**兩份都要改，而且要保持一致**。

Patch 內嘅路徑係 `backend/...`，所以要喺 `resources` 目錄入面執行：

```sh
cd /d Path\To\VoiceStudio\resources
git apply --verbose Path\To\cosyvoice3-cantonese.patch
```

或者手動對照「第二步」章節入面三段改動自己加。

### 重啟

完全退出 VoiceStudio（確保 Electron 同後端 process 全部結束），再重新啟動。

### 驗證

1. Dub 嘅目標語言下拉應該見到 **`Cantonese`**（第一步成果）
2. 揀 `Cantonese` 生成一段，然後睇後端 log 有冇：

```
language='yue' -> instruct='请用广东话表达'
```

診斷：

| 現象 | 代表 |
| :--- | :--- |
| 下拉**冇** `Cantonese` | 第一步未做，或者 app 更新咗覆蓋返 `app.asar` → 重跑腳本 |
| 下拉有，但 log **冇**嗰行 | `language` 根本冇傳到引擎 |
| log 有，但出嚟係**普通話** | 引擎 patch 未生效 → 確認兩份 `main.py` 都改咗 + 有冇真係重啟 |

### 如果你用開其他語言

唔使擔心。兩處改動都**只對 `yue` 生效**，英語、日語、普通話等路徑一行都冇變。

---

## 想加其他語言？

喺 `_LANG_INSTRUCT` 加一行就得（但**必須實測**，唔好靠估）：

```python
_LANG_INSTRUCT = {
    "yue": "请用广东话表达",
    # "xx": "请用xx语表达",   # 加之前一定要實測！
}
```

> ⚠️ **必須用簡體字**，並且實測確認有效。從今次經驗嚟睇，指令字眼嘅細微差異（加字、換字、換字形）都會令結果由「有效」變成「完全無效」甚至「模型崩潰」。

---

## 鳴謝 / Credits

呢個修復建立喺以下優秀嘅開源項目之上，謹此致謝：

| 項目 | 作者 | 授權 | 貢獻 |
| :--- | :--- | :--- | :--- |
| **[VoiceStudio](https://github.com/debpalash/VoiceStudio)** | [Debpalash](https://github.com/debpalash) | AGPL-3.0 | 被修復嘅應用程式，本 patch 修改嘅 `main.py` 原始作者 |
| **[CosyVoice](https://github.com/FunAudioLLM/CosyVoice)** | [FunAudioLLM / 阿里巴巴](https://github.com/FunAudioLLM) | Apache-2.0 | CosyVoice3 模型、`example.py` 粵語 instruct 用法（本修復嘅關鍵靈感來源） |
| **OmniVoice** | [Han Zhu](https://github.com/hanzhi713) | Apache-2.0 | VoiceStudio 預設 TTS 模型 |

> 本 repo 嘅 patch 同腳本均以 **AGPL-3.0** 授權（與 VoiceStudio 上游一致）。修改過嘅 `main.py` 及 `app.asar` 內原始著作權屬 **Debpalash / VoiceStudio** 所有，請繼續遵守上游授權條款。

---

## 作者

**修復同記錄：[18gogogo](https://github.com/18gogogo)**

如果呢份筆記幫到你，歡迎請我飲杯咖啡 ☕

<script type="text/javascript" src="https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js" data-name="bmc-button" data-slug="tenantreview" data-color="#FFDD00" data-emoji="☕"  data-font="Cookie" data-text="Buy me a coffee" data-outline-color="#000000" data-font-color="#000000" data-coffee-color="#ffffff" ></script>

---

<sub>AGPL-3.0 · 上游著作權歸 <a href="https://github.com/debpalash/VoiceStudio">Debpalash / VoiceStudio</a> 及 <a href="https://github.com/FunAudioLLM/CosyVoice">FunAudioLLM / CosyVoice</a> 所有</sub>
