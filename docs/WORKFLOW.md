# 派发与验收流程

本流程参照 `totalwar/docs/WORKFLOW.md` 和 brogue 的派发配方。

## 派发

Codex 不在 PATH 上，它是 ChatGPT.app 自带的 CLI：`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`。应用更新后路径可能变化，找不到时在 ChatGPT.app 包内搜索 `codex`。

```bash
cd ~/Documents/同步空间/DungeonRaid
nohup /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --approve-for-me \
  -m gpt-6-astra -c model_reasoning_effort="high" \
  -C "$PWD" -o /tmp/codex_<卡号>_last.txt \
  "请阅读 AGENTS.md，然后执行 docs/tasks/<卡号>.prompt.md" \
  > /tmp/codex_<卡号>.log 2>&1 &
```

注意事项：

- `--approve-for-me` 与 `-s` 不能同时使用。在这种模式下，沙箱只能写入工作目录和 `/tmp`。
- 用 nohup 启动的进程不会被 Claude Code 跟踪，必须另外挂一个后台等待器，循环检查 `kill -0 <PID>` 直到进程退出。
- 本仓库很小，也只有一个执行者，所以直接用 `-C` 在主工作区干活，不开 `--worktree`。每张卡开始前先 commit，确保回滚点干净。

## 派发失败的识别

- 如果进程退出后既没有 `-o` 输出文件，也没有报告，先查日志里是否有 `Reconnecting` 或 `workspace routing discovery failed`。
- 出现这两种字样，通常是网络或本机代理（127.0.0.1）短暂中断，导致连不上 chatgpt.com。
- 先用 `curl -m 10 https://chatgpt.com` 确认连通性已经恢复（返回 403 就说明连上了），再原样重新派发。
- 2026-10-15 T07 第一次派发就是这样失败的，重派后正常。

## 验收

1. 读 `-o` 指定文件里的最终回复，再读 `docs/tasks/<卡号>.report.md`。
2. 亲自阅读 diff。
3. 重跑测试（`npm test`）。
4. 抽查证据：随机选几条规格结论，回到 `reverse/native/ghidra` 核对对应的函数和常量。
5. 通过后 commit，并更新 `docs/PLAN.md` 中的「当前状态」。
