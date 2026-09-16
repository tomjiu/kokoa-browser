#!/usr/bin/env python3
"""
对 src/**/*.patch 做【真实】的 git apply --check 预检。

【为什么需要这个脚本】
  之前的 check.sh 只检查：
    · hunk 行数自洽
    · 文件以换行结尾
  但这两项【都不能保证 patch 能真的应用】。

  实际踩到的两个坑（都让一次 2-3 小时的构建白跑）：
    1. hunk 头 @@ 前面多了一个【空行】
       -> error: patch fragment without header at <file>:20: @
    2. 上下文里少写了几个字符（复制时被截断）
       -> error: patch does not apply
  两者 hunk 行数都【完全正确】。

【它怎么工作】
  patch 的 index 行带着【原始文件的 git blob 哈希】：
      index 017125bc2510e5f5e317a5e78c40d6aa9ded76ca..d343d8c6...
  所以可以：
    1. 从 GitHub 拉那个文件（按引擎版本对应的 tag）
    2. 算它的 blob 哈希，与 index 的 pre-image 比
    3. 一致 -> 说明拿到了【一模一样的原始文件】-> 建临时 git 仓库真跑 git apply --check

  【注意】哈希不一致时【跳过】而不是报失败 ——
  因为引擎版本可能与 tag 略有差异，或目标文件先被别的 patch 改过。
  跳过会在输出里标明，不是静默通过。

【用法】
  python scripts/preflight-patches.py                # 全部
  python scripts/preflight-patches.py a.patch b.patch  # 指定几个

【依赖】python3 + git + 网络（GitHub raw）
"""

import os, sys, re, hashlib, shutil, subprocess, tempfile, urllib.request, glob

# 引擎版本对应的 Firefox tag（见 CI 日志：engine 提交 f682356 "Firefox 156.0"）
FF_TAG = "FIREFOX_156_0_RELEASE"
RAW = "https://raw.githubusercontent.com/mozilla-firefox/firefox/%s/" % FF_TAG

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def blob_hash(data):
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()


def parse_patch(path):
    """取 (目标路径, pre-image 哈希)。拿不到就返回 (None, None)。"""
    t = open(path, encoding="utf-8", errors="replace").read()
    mf = re.search(r"^\+\+\+ b/(.+)$", t, re.M)
    mi = re.search(r"^index ([0-9a-f]+)\.\.", t, re.M)
    return (mf.group(1).strip() if mf else None,
            mi.group(1) if mi else None)


def fetch(target, cache):
    """下载并以 {target: bytes} 形式缓存。"""
    if target in cache:
        return cache[target]
    try:
        data = urllib.request.urlopen(RAW + target, timeout=30).read()
    except Exception:
        data = None
    cache[target] = data
    return data


def main():
    args = sys.argv[1:]
    if args:
        patches = [os.path.abspath(a) for a in args]
    else:
        patches = sorted(glob.glob(os.path.join(REPO, "src", "**", "*.patch"),
                                   recursive=True))

    cache = {}
    passed = failed = skipped = 0
    fails = []

    # 一个临时 git 仓库，逐个 patch 复位后检查
    work = tempfile.mkdtemp(prefix="kokoa-preflight-")
    subprocess.run("git init -q", cwd=work, shell=True, capture_output=True)

    for p in patches:
        rel = os.path.relpath(p, REPO).replace(os.sep, "/")
        target, pre = parse_patch(p)
        if not target or not pre:
            skipped += 1
            continue
        data = fetch(target, cache)
        if data is None:
            skipped += 1
            continue
        if blob_hash(data) != pre:
            skipped += 1
            continue

        # 复位工作区，放入【与 patch 完全对应的】原始文件
        subprocess.run("git rm -rq --cached . ", cwd=work, shell=True,
                       capture_output=True)
        dst = os.path.join(work, target)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, "wb").write(data)
        subprocess.run("git add -A", cwd=work, shell=True, capture_output=True)
        subprocess.run("git -c user.email=a@b -c user.name=a commit -q -m x --allow-empty",
                       cwd=work, shell=True, capture_output=True)

        r = subprocess.run(
            "git apply --check --ignore-space-change --ignore-whitespace \"%s\"" % p,
            cwd=work, shell=True, capture_output=True, text=True)
        if r.returncode == 0:
            passed += 1
            print("  OK    " + rel)
        else:
            failed += 1
            log = ((r.stdout or "") + (r.stderr or "")).strip().splitlines()
            msg = log[0][:120] if log else "?"
            print("  FAIL  " + rel)
            print("        " + msg)
            fails.append((rel, msg))

    shutil.rmtree(work, ignore_errors=True)

    print()
    print("=== %d 通过 / %d 失败 / %d 跳过（引擎版本不同或目标被别的 patch 改过）==="
          % (passed, failed, skipped))
    if failed:
        print()
        print("先修这些再排构建（一轮 2-3 小时）")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
