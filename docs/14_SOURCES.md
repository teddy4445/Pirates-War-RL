# 14. Primary technical references

Checked while preparing this bundle on 2026-09-25. These sources support platform capabilities, not the proposed balance values, benchmark performance, or security completeness. Recheck APIs and compatible versions during implementation; no unverified dependency version is pinned here.

| ID | Primary source | Used for |
|---|---|---|
| S01 | [OpenAI: Build skills](https://developers.openai.com/codex/skills/) | Repository `.agents/skills` discovery, SKILL.md structure, explicit skill invocation. |
| S02 | [OpenAI: AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md/) | Project instructions and layered repository guidance. |
| S03 | [QuickJS-emscripten: QuickJSRuntime API](https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten-core/classes/QuickJSRuntime.md) | Separate runtimes, memory/stack/interrupt controls, pending Promise jobs, lifecycle. |
| S04 | [TensorFlow.js: save and load models](https://www.tensorflow.org/js/guide/save_load) | Serialized topology/weights, browser persistence, download/export, local loading. |
| S05 | [TensorFlow.js API](https://js.tensorflow.org/api/latest/#io.browserFiles) | Browser file loading and runtime model/tensor API reference. |
| S06 | [ONNX Runtime Web deployment](https://onnxruntime.ai/docs/tutorials/web/deploy.html) and [web overview](https://onnxruntime.ai/docs/tutorials/web/) | Browser inference, providers, version-matched WASM/assets, deployment constraints. |
| S07 | [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) | Worker messaging/lifecycle; host worker access to APIs such as fetch. |
| S08 | [MDN: Using service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) | Optional offline application caching and lifecycle. |
| S09 | [MDN: storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Local persistence is quota-limited and not a guaranteed backup. |
| S10 | [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) | Display scheduling and hidden-tab behavior; separation from physics. |
| S11 | [Kenney: 2D Pirate Pack](https://kenney.nl/assets/pirate-pack) | Optional creator-listed CC0 pirate sprites; not bundled or required. |
| S12 | [MDN: Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) | Audio context/user-gesture behavior and user controls. |

## Interpretation cautions

QuickJS controls are defense-in-depth components, not a proof that a whole application safely hosts arbitrary code. TF.js/ONNX loading capability does not mean every neural network or Python checkpoint is supported. Browser computation is not hard real time. Static hosting does not itself provide shared submissions or authentic grading. Local seeded runs are not universally bit-identical across engines/providers. These limitations are reflected in the architecture and acceptance gates.

## Asset provenance

No third-party visual/audio assets, fonts, or trained models are included in this specification bundle. The sound generator creates original procedural effects locally. If external art is added later, preserve its source URL, author, exact license, downloaded version, modifications, and file-level identifiers in the application's asset provenance file.
