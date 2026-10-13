# CosyVoice3 引擎安裝：從失敗到成功

這篇記錄 VoiceStudio 一鍵安裝 CosyVoice3 引擎時，**為什麼不能用最直接的做法、實際做了什麼、以及每一個會讓人卡住的地方**。

引擎修好之後依然讀成粵語以外語言的問題，見主 [README](../README.md)。

---

## 一、為什麼不能直接裝進應用的 Python 環境

最直覺的做法是 `pip install` 到 VoiceStudio 自己的環境，然後 in-process 載入。這條路**走不通**：

- 上游 CosyVoice 有自己一套環境（Python 3.10）與一套依賴 pins
- 這些 pins 與應用自身的 `transformers>=5.3` **直接衝突**
- 就算硬裝成功，兩邊搶同一個 `transformers` 也只是把問題推後

所以改為 **sidecar 架構**：

```
主程序（VoiceStudio backend）
   │  stdin/stdout  length-prefixed JSON wire protocol
   ▼
獨立 venv 的 python.exe  →  main.py  →  CosyVoice 模型
```

這樣兩邊各自擁有自己的 `transformers`，互不干擾，而且主程序可以隨時 kill 掉引擎。

---

## 二、一鍵安裝實際做了什麼

入口：**Model Catalogue → Engines**。整個流程是 `services/sidecar_install.py` 驅動的一個可續跑背景工作。

### 步驟 1 — 取得原始碼

| 方式 | 條件 | 說明 |
| :--- | :--- | :--- |
| `git clone --depth 1` | 系統有 git | 主路徑，快，而且留下一個使用者日後可以自行更新的 repo |
| GitHub source tarball | **系統沒有 git** | 退回方案，用 httpx 下載（支援 proxy 環境變數）再用 `tarfile` 解開 |

> **為什麼不採用 `pip install git+https://…`？** 因為引擎的**目錄**反正必須存在於磁碟上 — sidecar 的 venv 與權重路徑都是相對於這個目錄解析的。

> **Windows 常見沒有 git**，所以 tarball 路徑不是可有可無的備援，而是很多人的主路徑。

### 步驟 2 — 額外來源（最容易被忽略的一步）

`git clone --depth 1` **不會**帶來 submodule，而 CosyVoice 一定要這些東西：

| 路徑 | 用途 |
| :--- | :--- |
| `third_party/Matcha-TTS` | flow matching 部分，`import matcha.utils` 直接依賴 |
| `third_party/PyWorld` | 語音合成後處理，**需要本機 C++ 編譯器**才能編譯 |
| `third_party/PyWorld/lib/World` | PyWorld 的 C++ 本體 |

每一個都是獨立 pin 到特定 commit，並各自有 tarball 備援。

### 步驟 3 — 建立獨立 venv

```
uv venv --python 3.10
```

### 步驟 4 — 安裝 PyTorch（依主機選擇）

安裝器**自己決定** torch 版本，不寫死在 requirements 裡：

| 主機 | 安裝 |
| :--- | :--- |
| NVIDIA GPU | `torch==2.7.0+cu128` |
| 其他 Windows / Linux | `torch==2.7.0+cpu` |
| macOS | `torch==2.7.0`（一般版） |

> **為什麼要覆蓋上游的 2.3.1？** 上游那個版本只針對 CUDA 12.1，**在 RTX 50 系列 GPU 上根本跑不起來**。

### 步驟 5 — 安裝裁剪版 requirements

見下方第四節。

### 步驟 6 — 下載權重

從 `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` 取用，**只下載推理需要的檔案**（約 **5.4 / 9.8 GB**）：

```
cosyvoice3.yaml  config.json  configuration.json
campplus.onnx    speech_tokenizer_v3.onnx
llm.pt           flow.pt      hift.pt
CosyVoice-BlankEN/*
```

> 端點由 HF endpoint 自動選擇決定，**沒有硬寫 `huggingface.co`**；token 走三段式解析。

---

## 三、鎖定版本（可重現的關鍵）

全部 pin 到特定 commit，重裝時結果一致：

| 元件 | 鎖定 |
| :--- | :--- |
| CosyVoice | `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`（2026-05-25） |
| Matcha-TTS | `dd9105b34bf2be2230f4aa1e4769fb586a3c824e` |
| PyWorld | `f31ad88d543fdaebbda2d0c9a5e4d4f991ae0b6c` |
| World（PyWorld 的 C++ 本體） | `d625e7608ca23a870018f01e7c562ac683d9847f` |
| 權重 repo | `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` |
| 權重 revision | `29e01c4e8d000f4bcd70751be16fa94bf3d85a18` |

安裝完成後的目錄結構：

```
DATA_DIR/engines/cosyvoice/
└── CosyVoice/                          ← OMNIVOICE_COSYVOICE_DIR 指向這裡
    ├── .venv/                          Python 3.10 + torch 2.7.0
    ├── pretrained_models/
    │   └── Fun-CosyVoice3-0.5B/
    └── third_party/
        ├── Matcha-TTS/
        └── PyWorld/
```

安裝成功後，路徑會同時寫入：

1. `os.environ["OMNIVOICE_COSYVOICE_DIR"]` — **立即生效，不用重啟**
2. `prefs.json` 的 `env.OMNIVOICE_COSYVOICE_DIR` — 下次啟動時由 `main.py` 還原

> 如果你自己已經有一份 CosyVoice clone，並且環境變數已經指向它，安裝器會**完全不碰**你的目錄。

---

## 四、requirements.txt 裁剪了什麼，為什麼

上游的 requirements 不能直接用，裁剪決策與踩過的坑：

| 決策 | 原因 |
| :--- | :--- |
| 去掉所有 `--extra-index-url` | 上游加了 PyTorch 的 cu121 index，以及一個**第三方 Azure DevOps feed**（用來裝 onnxruntime-gpu）。安裝器自己決定 torch，且不用任何第三方 index |
| `torch` / `torchaudio` 不列入 | 由安裝器依主機選擇（見步驟 4） |
| 上調多個套件版本 | 超過已公布的安全公告下限：`diffusers`、`hydra-core`、`lightning`、`modelscope`、`onnx`、`protobuf`、`transformers`。這組版本已在 Windows 實機安裝並通過 import 探測 |
| `transformers` 5 曾對照驗證 | 對照 CosyVoice 自己的 tokenizer，token id 與 4.57.6 **完全相同** |
| 捨棄 `deepspeed`、`tensorrt-cu12*` | 僅 Linux 加速用，且引入大量額外依賴 |
| 捨棄 `onnxruntime-gpu`、`wetext` | 分別是第三方 index 依賴、遠端 normalizer 資料 |
| 捨棄 web / training 相關 | 推理用不到 |
| **保留** `gdown`、`wget`、`pyarrow` | 上游在 runtime 會 import，刪掉會炸 |
| PyWorld **另行從 pinned source 編譯** | 該 revision 改用 `importlib.metadata`，所以不再需要 `pkg_resources` 與過時的 setuptools runtime。**但需要 C++ 編譯器** |
| `openai-whisper` `20231117` → `20250625` | 舊版在 **build 時**就需要 `pkg_resources`，會直接 build 失敗。CosyVoice 只用到它的 mel-spectrogram frontend |

---

## 五、會失敗的地方（重點）

### ❌ 失敗 1：bf16 精度陷阱（最致命，而且無聲）

**症狀**：安裝完全成功、模型能載入、能生成，但**音質明顯劣化**，而且**不會報任何錯**。

**原因**：Transformers 5 會沿用 blank checkpoint（`CosyVoice-BlankEN`）的 **bf16** dtype 去建構 Qwen。這時候再把訓練時是 **fp32** 的 `llm.pt` 載進去，權重會被**不可逆地四捨五入**。事後再呼叫 `.float()` **救不回來**——精度已經在載入那一刻丟失了。

**修正**：載入當時就強制 fp32。`main.py` 內建了這個 context manager：

```python
@contextlib.contextmanager
def _qwen_full_precision_load():
    """Load trained fp32 weights before any explicit upstream fp16 conversion."""
    ...
    def load(cls, *args, **kwargs):
        if "dtype" not in kwargs and "torch_dtype" not in kwargs:
            kwargs["torch_dtype"] = torch.float32
        return original(*args, **kwargs)

    Qwen2ForCausalLM.from_pretrained = classmethod(load)
    try:
        yield
    finally:
        ...  # 還原 classmethod，即使載入失敗也還原
```

> ### ⚠️ 一個非常容易混淆的點
>
> 在 compute capability **7.0（sm_70）** 的 GPU 上，`torch.cuda.is_bf16_supported()` 可能回傳 `True`。
>
> 但**「GPU 能以 bf16 運算」≠「權重可以安全地以 bf16 儲存」**。這是兩件完全不同的事。前者關乎運算能力，後者關乎**載入時的量化誤差**。
>
> 不要看 `is_bf16_supported()` 就以為可以省掉這個修正。

### ❌ 失敗 2：attention mask 被吃掉

**症狀**：模型會載入，但生成結果**聽不到你提供的參考語音 / 文字 prompt**，也就是 zero-shot、instruct 功能全部失效，退回預設聲音。

**原因**：新版 Transformers 會把 one-token mask 當成「字面的一個 token」處理，導致快取中的文字 / 語音 prompt 被遮蔽。

**修正**：`main.py` 的 `_repair_qwen_cache()` 只對該實例替換 `forward_one_step`，把快取長度補進 mask：

```python
prefix = masks.new_ones((*masks.shape[:-1], length))
return torch.cat((prefix, masks), dim=-1)
```

### ❌ 失敗 3：`sys.path` 必須自己加

**症狀**：`ModuleNotFoundError: No module named 'cosyvoice'` 或 `matcha`，即使 venv 裝滿了東西。

**原因**：**CosyVoice 不是一個 package**。它跟上游自己的 `example.py` 一樣，必須把 checkout 目錄與 `third_party/Matcha-TTS` 主動加進 `sys.path`。

安裝器的健康探測就是這樣驗證的：

```python
sys.path[:0] = [checkout, os.path.join(checkout, 'third_party', 'Matcha-TTS')]
from cosyvoice.cli.cosyvoice import AutoModel
import cosyvoice.dataset.processor
import matcha.utils
```

> 這四個 import 全部成功，才算安裝健康。少一個都代表有東西沒裝好。

### ❌ 失敗 4：沒有設定環境變數

**症狀**：

```
OMNIVOICE_COSYVOICE_DIR is not set.
```

**原因**：sidecar 靠這個環境變數定位 checkout。正常情況下安裝器會自動寫入 `os.environ` 與 `prefs.json`；如果你是手動安裝 / 測試，就要自己設：

```sh
set OMNIVOICE_COSYVOICE_DIR=C:\Path\To\DATA_DIR\engines\cosyvoice\CosyVoice
```

> **只設這一個不夠**：如果權重不在 `pretrained_models/Fun-CosyVoice3-0.5B/`，還要另外設 `OMNIVOICE_COSYVOICE_MODEL` 指向模型資料夾。而且那個路徑**必須真的存在** — 指錯時它會明確報錯，而不是默默改用預設模型（那會用一個你沒選的聲音合成）。

### ❌ 失敗 5：磁碟空間不足

估算約 **14 GB**：

| 項目 | 大小 |
| :--- | ---: |
| 原始碼 | ~0.1 GB |
| venv（CUDA torch） | ~7 GB |
| 權重 | ~5.4 GB |

另外會保留 **5 GB headroom**。這個 headroom 故意比模型安裝守衛的 10 GB 小 — 因為上面的 14 GB 已經是保守高估，再疊加會把只有 15 GB 空間的機器擋在門外。

### ❌ 失敗 6：安裝中途斷掉

安裝器是**冪等且可續跑**的，每個步驟在輸出已經健康時會跳過、半殘時會修補：

| 狀態 | 處理 |
| :--- | :--- |
| checkout 存在但缺 `pyproject.toml` | 重新取得原始碼 |
| venv 存在但 import 不了 probe module | 重新安裝 venv |
| 權重下載到一半 | `snapshot_download` 自動續傳 |

所以中斷之後**直接重跑**即可，不用手動清理。

---

## 六、安裝完成的判定標準

四個條件同時成立：

1. `OMNIVOICE_COSYVOICE_DIR` 指向的目錄存在
2. 該目錄下的 `.venv` 能成功執行四個 probe import
3. `pretrained_models/Fun-CosyVoice3-0.5B/` 內有 `cosyvoice3.yaml` 等檔案
4. 後端 log 能正常啟動 sidecar 並收到 heartbeat frame

> 冷啟動載入模型與 text normaliser 需要一段時間，預設接收逾時是 **900 秒**（可用 `OMNIVOICE_COSYVOICE_RECV_TIMEOUT_S` 調整，最低 30 秒，且會拒絕 inf/nan 以免逾時被無限關閉）。

---

## 七、實測環境（本文件撰寫時）

| 項目 | 值 |
| :--- | :--- |
| Python（引擎 venv） | 3.10.21 |
| torch | 2.7.0+cu128 |
| transformers | 5.10.1 |
| CUDA | 可用 |
| GPU compute capability | 7.0（sm_70） |

---

## 相關

- [主 README](../README.md) — 安裝好之後，為什麼仍然讀成粵語以外的語言，以及如何修
- [`scripts/patch-app-asar.mjs`](../scripts/patch-app-asar.mjs) — 讓下拉選單出現 Cantonese
- [`patches/cosyvoice3-cantonese.patch`](../patches/cosyvoice3-cantonese.patch) — 引擎層的粵語修復
